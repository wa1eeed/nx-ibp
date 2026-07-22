import { ConflictException, Injectable, Logger, UnprocessableEntityException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import { RateLimitService } from "../../common/security/rate-limit.service";
import { RequestContextService } from "../../common/request-context/request-context.service";
import { RBAC_MODULES, PRESET_ROLES, parsePerm } from "../rbac/rbac.constants";
import type { SignupDto } from "./dto/signup.dto";

/** الأقسام الافتراضية لشركة الوساطة (هيكل تنظيمي جاهز) + دورها الافتراضي الموروَّث عند إسناد موظف. */
const DEFAULT_DEPARTMENTS: Array<{ name: string; role: string }> = [
  { name: "المبيعات وتطوير الأعمال", role: "sales_rep" },
  { name: "الالتزام والمطابقة", role: "compliance_manager" },
  { name: "الاكتتاب الفني", role: "pricing_officer" },
  { name: "الإدارة المالية والمحاسبة", role: "accountant" },
  { name: "خدمة العملاء", role: "customer_care_manager" },
  { name: "إدارة المطالبات", role: "claims_officer" },
];

const DEFAULT_PLAN = "basic";
const TRIAL_DAYS = 14;
const CONTACT_SALES_PLANS = new Set(["enterprise"]); // باقات المؤسسات: بيع استشاري (Lead) — لا تسجيل ذاتي

/**
 * قالب شجرة الحسابات القياسي (يطابق seedFinanceFoundation) — كود 17 رقماً من
 * المسار الهرمي، المستوى 1/2 مقفل، وفصل أموال العملاء خارج الميزانية.
 */
// شجرة حسابات وساطة تأمين قياسية: مستوى 1 عناوين مقفلة · مستوى 2 حسابات ترحيل (postable).
const COA_TEMPLATE: Array<{ path: number[]; name: string; type: string; onBal: boolean }> = [
  { path: [1], name: "الأصول", type: "asset", onBal: true },
  { path: [1, 1], name: "النقد والبنوك", type: "asset", onBal: true },
  { path: [1, 3], name: "ذمم العملاء المدينة", type: "asset", onBal: true },
  { path: [1, 4], name: "ذمم عمولات على شركات التأمين", type: "asset", onBal: true }, // نموذج الدفع المباشر
  { path: [1, 5], name: "ضريبة القيمة المضافة — المدخلات (قابلة للاسترداد)", type: "asset", onBal: true },
  { path: [2], name: "الخصوم", type: "liability", onBal: true },
  { path: [2, 1], name: "ذمم شركات التأمين الدائنة", type: "liability", onBal: true },
  { path: [2, 2], name: "أمانات أقساط العملاء (خارج الميزانية)", type: "liability", onBal: false },
  { path: [2, 3], name: "ضريبة القيمة المضافة المستحقة (المخرجات)", type: "liability", onBal: true },
  { path: [3], name: "حقوق الملكية", type: "equity", onBal: true },
  { path: [3, 1], name: "رأس المال", type: "equity", onBal: true },
  { path: [3, 2], name: "الأرباح المُبقاة", type: "equity", onBal: true },
  { path: [4], name: "الإيرادات", type: "revenue", onBal: true },
  { path: [4, 1], name: "عمولات الوساطة", type: "revenue", onBal: true },
  { path: [4, 2], name: "رسوم خدمات وإصدار الوثائق", type: "revenue", onBal: true },
  { path: [5], name: "المصروفات", type: "expense", onBal: true },
  { path: [5, 1], name: "عمولات المنتِجين (الوسطاء الفرعيون)", type: "expense", onBal: true },
  { path: [5, 2], name: "عمولات وحوافز الموظفين", type: "expense", onBal: true },
  { path: [5, 3], name: "الرواتب والأجور", type: "expense", onBal: true },
  { path: [5, 4], name: "الإيجارات", type: "expense", onBal: true },
  { path: [5, 5], name: "المرافق والخدمات", type: "expense", onBal: true },
  { path: [5, 6], name: "التسويق والدعاية", type: "expense", onBal: true },
  { path: [5, 9], name: "مصروفات عمومية أخرى", type: "expense", onBal: true },
];
const coa17 = (path: number[]): string => path.map((p) => String(p).padStart(2, "0")).join("").padEnd(17, "0");

@Injectable()
export class SignupService {
  private readonly logger = new Logger(SignupService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly rateLimit: RateLimitService,
    private readonly ctx: RequestContextService,
  ) {}

  /** كتالوج الباقات العام (للاندينق + معالج التسجيل): سعر لكل مستخدم شهري/سنوي + التجربة + نسبة التوفير + الموديولز. */
  async plans() {
    const plans = await this.prisma.plan.findMany({
      orderBy: { priceMonthly: "asc" },
      select: { code: true, name: true, seatLimit: true, priceMonthly: true, priceYearly: true, trialDays: true, slaResponseHours: true, entitlements: { select: { featureKey: true, mode: true } } },
    });
    return plans.map((p) => {
      const monthly = Number(p.priceMonthly);
      const yearly = Number(p.priceYearly);
      const yearlyPerMonth = yearly / 12;
      const savingsPct = monthly > 0 ? Math.round((1 - yearlyPerMonth / monthly) * 100) : 0; // توفير الاشتراك السنوي
      const modules = p.entitlements.filter((e) => e.featureKey.startsWith("module.") && e.mode !== "DISABLED").map((e) => e.featureKey.replace("module.", ""));
      return { code: p.code, name: p.name, seatLimit: p.seatLimit, pricePerUserMonthly: monthly, pricePerUserYearly: yearly, trialDays: p.trialDays, slaResponseHours: p.slaResponseHours, savingsPct: Math.max(0, savingsPct), modules };
    });
  }

  /** مصفوفة مقارنة الباقات (عام): تُبنى من مميزات كل باقة، مجمّعة بالفئات — تعكس تغييرات السوبر أدمن فورًا. */
  async compare() {
    const categories: Array<{ category: string; features: string[] }> = [
      { category: "core", features: ["module.clients", "module.sales", "module.underwriting", "module.production", "module.renewals", "module.service", "module.claims", "module.finance", "module.hr", "feature.verification", "feature.zatca", "module.compliance", "feature.auditImmutable", "module.reports"] },
      { category: "growth", features: ["feature.crm", "feature.producers", "feature.formTemplates", "feature.analytics", "feature.approvalChains", "feature.org", "feature.mfaEnforce"] },
      { category: "enterprise", features: ["feature.carrierIntegration", "feature.dlp", "feature.api", "feature.whiteLabel", "feature.prioritySupport"] },
      { category: "limits", features: ["storage.quotaMb", "upload.maxFileMb", "trialDays", "sla"] },
    ];
    const plans = await this.prisma.plan.findMany({
      orderBy: { priceMonthly: "asc" },
      select: { code: true, name: true, seatLimit: true, priceMonthly: true, priceYearly: true, trialDays: true, slaResponseHours: true, entitlements: { select: { featureKey: true, mode: true, numericValue: true } } },
    });
    const rows = plans.map((p) => {
      const ent = new Map(p.entitlements.map((e) => [e.featureKey, e]));
      const cells: Record<string, string | number> = {};
      for (const cat of categories) for (const key of cat.features) {
        if (key === "trialDays") cells[key] = p.trialDays;
        else if (key === "sla") cells[key] = p.slaResponseHours ?? 0;
        else if (key === "storage.quotaMb") cells[key] = Math.round((Number(ent.get(key)?.numericValue ?? 0) / 1024) * 10) / 10; // GB
        else if (key === "upload.maxFileMb") cells[key] = Number(ent.get(key)?.numericValue ?? 0);
        else cells[key] = (ent.get(key)?.mode ?? "DISABLED"); // INCLUDED | ADDON | DISABLED
      }
      return { code: p.code, name: p.name, pricePerUserMonthly: Number(p.priceMonthly), pricePerUserYearly: Number(p.priceYearly), trialDays: p.trialDays, cells };
    });
    return { categories, plans: rows };
  }

  /**
   * يسجّل طلب تواصل مبيعات (Lead). يُسمح بطلبات متعدّدة من نفس البريد (استفسارات مختلفة/صفحات
   * مختلفة)؛ نمنع فقط **الإرسال المزدوج السريع** (نقرة مكرّرة خلال 60 ثانية) بإعادة الطلب نفسه.
   */
  async createLead(dto: { name: string; email: string; company?: string; phone?: string; planCode?: string; seats?: number; message?: string }) {
    const email = dto.email.toLowerCase().trim();
    const recent = await this.prisma.lead.findFirst({
      where: { email, createdAt: { gte: new Date(Date.now() - 60_000) } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (recent) return { ok: true, id: recent.id }; // idempotent — لا تُنشئ نسخة مكرّرة عند النقر السريع
    const lead = await this.prisma.lead.create({ data: { name: dto.name.trim(), email, company: dto.company ?? null, phone: dto.phone ?? null, planCode: dto.planCode ?? null, seats: dto.seats ?? null, message: dto.message ?? null } });
    this.logger.log(`طلب تواصل مبيعات جديد: ${dto.name} (${email})${dto.company ? ` — ${dto.company}` : ""}`);
    return { ok: true, id: lead.id };
  }

  /** توفّر البريد (فريد عالميًا) — يُستدعى قبل الانتقال بين خطوات التسجيل. نفس تطبيع signup. */
  async checkEmail(rawEmail: string) {
    const email = rawEmail.toLowerCase().trim();
    if (!/.+@.+\..+/.test(email)) return { available: false };
    const existing = await this.prisma.user.findFirst({ where: { email }, select: { id: true } });
    return { available: !existing };
  }

  async signup(dto: SignupDto) {
    const email = dto.adminEmail.toLowerCase().trim();
    await this.rateLimit.assertNotLocked("signup", email); // كبح إساءة التسجيل

    const planCode = dto.planCode ?? DEFAULT_PLAN;
    const plan = await this.prisma.plan.findUnique({ where: { code: planCode } });
    if (!plan) {
      await this.rateLimit.recordFailure("signup", email);
      throw new UnprocessableEntityException("باقة غير معروفة");
    }
    // باقات المؤسسات لا تُتاح بالتسجيل الذاتي — تُوجَّه لفريق المبيعات
    if (CONTACT_SALES_PLANS.has(plan.code)) {
      throw new UnprocessableEntityException("باقة المؤسسات عبر فريق المبيعات — تواصل معنا");
    }

    // البريد فريد عالميًا (تسجيل الدخول يبحث بالبريد عبر كل المستأجرين)
    const existing = await this.prisma.user.findFirst({ where: { email }, select: { id: true } });
    if (existing) {
      await this.rateLimit.recordFailure("signup", email);
      throw new ConflictException("البريد مستخدم مسبقاً");
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    // التزويد كامل بلا سياق مستأجر (سياق فارغ) ⇒ guard العزل يُتخطّى ونمرّر tenantId صراحةً.
    const result = await this.ctx.run({}, () => this.provision(dto, email, plan, passwordHash));

    await this.rateLimit.clear("signup", email);
    const accessToken = await this.jwt.signAsync({ sub: result.userId, tenantId: result.tenantId, roleId: result.roleId, email });
    await this.audit.log({ tenantId: result.tenantId, userId: result.userId, action: "create", entity: "tenant_signup", entityId: result.tenantId, meta: { plan: planCode, self_signup: true } });
    this.logger.log(`تسجيل ذاتي جديد: مستأجر ${result.tenantId} (${dto.companyName})`);

    return {
      accessToken,
      tenant: { id: result.tenantId, name: dto.companyName, plan: planCode, status: "TRIAL" },
      user: { id: result.userId, email, fullName: dto.adminName, roleId: result.roleId, tenantId: result.tenantId },
    };
  }

  /** ينشئ المستأجر وكل سقالته ذرّياً (transaction). يفترض غياب سياق المستأجر. */
  private async provision(dto: SignupDto, email: string, plan: { id: string; trialDays: number }, passwordHash: string) {
    const productLines = await this.prisma.productLine.findMany({ select: { code: true } });
    const enabledProducts = productLines.map((l) => l.code);
    const seats = Math.max(1, dto.seatCount ?? 1); // عدد المستخدمين (تسعير لكل مستخدم، بلا سقف من الباقة)
    const cycle = dto.cycle === "YEARLY" ? "YEARLY" : "MONTHLY";
    const trialDays = plan.trialDays > 0 ? plan.trialDays : TRIAL_DAYS; // تجربة الباقة، أو الافتراضي

    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: dto.companyName, nameEn: dto.companyNameEn ?? null, crNumber: dto.crNumber ?? null, unifiedNumber: dto.unifiedNumber ?? null, vatNumber: dto.vatNumber ?? null, phone: dto.phone ?? null, status: "TRIAL", billingModel: "PASS_THROUGH" },
        select: { id: true },
      });
      const tenantId = tenant.id;
      const renewsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);

      // المقاعد المرخّصة = المقاعد المختارة عند التسجيل (رخصة التجربة). لإضافة أكثر لاحقًا يلزم شراء مقاعد (رفع الرخصة).
      await tx.subscription.create({ data: { tenantId, planId: plan.id, cycle, seatsUsed: seats, seatsLicensed: seats, renewsAt } });

      await tx.tenantConfig.create({
        data: {
          tenantId,
          enabledProducts,
          sequenceFormats: { policy: "POL-{branch}-{class}-{year}-{seq}", lead: "SL-{branch}-{class}-{year}-{seq}" },
          branding: { primary: "#0d9488", logoText: "IBP" },
        },
      });

      await tx.branch.create({ data: { tenantId, code: "HQ", name: "الفرع الرئيسي" } });

      // كل الأدوار المُعدّة مسبقًا (مصفوفة الصلاحيات المطابقة لأقسام شركة الوساطة السعودية) جاهزة للحساب الجديد.
      const roleIdByCode: Record<string, string> = {};
      for (const r of PRESET_ROLES) {
        const role = await tx.role.create({ data: { tenantId, name: r.nameAr, isPreset: true }, select: { id: true } });
        roleIdByCode[r.code] = role.id;
        await tx.permission.createMany({ data: RBAC_MODULES.map((m) => ({ roleId: role.id, module: m, ...parsePerm(r.matrix[m]) })) });
      }

      // الهيكل التنظيمي الافتراضي: «الإدارة العليا» جذرًا + الأقسام الستة فروعًا، لكلٍّ دوره الافتراضي الموروَّث عند إسناد موظف.
      const mgmt = await tx.department.create({ data: { tenantId, name: "الإدارة العليا", defaultRoleId: roleIdByCode.general_manager }, select: { id: true } });
      for (const d of DEFAULT_DEPARTMENTS) {
        await tx.department.create({ data: { tenantId, name: d.name, parentId: mgmt.id, defaultRoleId: roleIdByCode[d.role] ?? null } });
      }

      // المدير (المالك) = دور المدير العام (وصول كامل) ضمن قسم الإدارة العليا.
      const user = await tx.user.create({
        data: { tenantId, email, fullName: dto.adminName, status: "ACTIVE", roleId: roleIdByCode.general_manager, departmentId: mgmt.id, passwordHash },
        select: { id: true },
      });

      // الأساس المحاسبي: شجرة الحسابات (مستوى 1/2 مقفل) + مركز تكلفة للفرع الرئيسي
      for (const a of COA_TEMPLATE) {
        const code = coa17(a.path);
        const level = a.path.length;
        const parentCode = level > 1 ? coa17(a.path.slice(0, -1)) : null;
        await tx.chartOfAccount.create({
          data: {
            tenantId,
            code,
            name: a.name,
            level,
            isOnBalance: a.onBal,
            isLocked: level < 2, // مستوى 1 (العناوين) فقط مقفل؛ حسابات الترحيل مفتوحة
            accountType: a.type,
            parentId: parentCode ? (await tx.chartOfAccount.findFirst({ where: { tenantId, code: parentCode }, select: { id: true } }))?.id ?? null : null,
          },
        });
      }
      await tx.costCenter.create({ data: { tenantId, code: "HQ", name: "الفرع الرئيسي", level: 1 } });

      return { tenantId, userId: user.id, roleId: roleIdByCode.general_manager };
    });
  }
}
