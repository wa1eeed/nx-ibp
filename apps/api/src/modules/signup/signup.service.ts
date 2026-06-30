import { ConflictException, Injectable, Logger, UnprocessableEntityException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import { RateLimitService } from "../../common/security/rate-limit.service";
import { RequestContextService } from "../../common/request-context/request-context.service";
import { RBAC_MODULES } from "../rbac/rbac.constants";
import type { SignupDto } from "./dto/signup.dto";

const DEFAULT_PLAN = "basic";
const TRIAL_DAYS = 14;

/**
 * قالب شجرة الحسابات القياسي (يطابق seedFinanceFoundation) — كود 17 رقماً من
 * المسار الهرمي، المستوى 1/2 مقفل، وفصل أموال العملاء خارج الميزانية.
 */
const COA_TEMPLATE: Array<{ path: number[]; name: string; type: string; onBal: boolean }> = [
  { path: [1], name: "الأصول", type: "asset", onBal: true },
  { path: [1, 1], name: "الأصول المتداولة", type: "asset", onBal: true },
  { path: [1, 3], name: "ذمم العملاء المدينة", type: "asset", onBal: true },
  { path: [2], name: "الخصوم", type: "liability", onBal: true },
  { path: [2, 1], name: "ذمم شركات التأمين الدائنة", type: "liability", onBal: true },
  { path: [2, 2], name: "أمانات أقساط العملاء (خارج الميزانية)", type: "liability", onBal: false },
  { path: [2, 3], name: "ضريبة القيمة المضافة المستحقة", type: "liability", onBal: true },
  { path: [3], name: "حقوق الملكية", type: "equity", onBal: true },
  { path: [4], name: "الإيرادات", type: "revenue", onBal: true },
  { path: [4, 1], name: "عمولات الوساطة", type: "revenue", onBal: true },
  { path: [5], name: "المصروفات", type: "expense", onBal: true },
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

  async signup(dto: SignupDto) {
    const email = dto.adminEmail.toLowerCase().trim();
    await this.rateLimit.assertNotLocked("signup", email); // كبح إساءة التسجيل

    const planCode = dto.planCode ?? DEFAULT_PLAN;
    const plan = await this.prisma.plan.findUnique({ where: { code: planCode } });
    if (!plan) {
      await this.rateLimit.recordFailure("signup", email);
      throw new UnprocessableEntityException("باقة غير معروفة");
    }

    // البريد فريد عالميًا (تسجيل الدخول يبحث بالبريد عبر كل المستأجرين)
    const existing = await this.prisma.user.findFirst({ where: { email }, select: { id: true } });
    if (existing) {
      await this.rateLimit.recordFailure("signup", email);
      throw new ConflictException("البريد مستخدم مسبقاً");
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    // التزويد كامل بلا سياق مستأجر (سياق فارغ) ⇒ guard العزل يُتخطّى ونمرّر tenantId صراحةً.
    const result = await this.ctx.run({}, () => this.provision(dto, email, plan.id, passwordHash));

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
  private async provision(dto: SignupDto, email: string, planId: string, passwordHash: string) {
    const productLines = await this.prisma.productLine.findMany({ select: { code: true } });
    const enabledProducts = productLines.map((l) => l.code);

    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: dto.companyName, nameEn: dto.companyNameEn ?? null, crNumber: dto.crNumber ?? null, status: "TRIAL", billingModel: "PASS_THROUGH" },
        select: { id: true },
      });
      const tenantId = tenant.id;
      const renewsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

      await tx.subscription.create({ data: { tenantId, planId, cycle: "MONTHLY", seatsUsed: 1, renewsAt } });

      await tx.tenantConfig.create({
        data: {
          tenantId,
          enabledProducts,
          sequenceFormats: { policy: "POL-{branch}-{class}-{year}-{seq}", lead: "SL-{branch}-{class}-{year}-{seq}" },
          branding: { primary: "#0d9488", logoText: "IBP" },
        },
      });

      await tx.branch.create({ data: { tenantId, code: "HQ", name: "الفرع الرئيسي" } });

      // دور المالك: وصول كامل لكل الموديولز (المدير ينشئ بقية الأدوار/الأقسام لاحقاً)
      const role = await tx.role.create({ data: { tenantId, name: "مالك الحساب", isPreset: true }, select: { id: true } });
      await tx.permission.createMany({
        data: RBAC_MODULES.map((m) => ({ roleId: role.id, module: m, canAccess: true, canCreate: true, canEdit: true, canDelete: true })),
      });

      const user = await tx.user.create({
        data: { tenantId, email, fullName: dto.adminName, status: "ACTIVE", roleId: role.id, passwordHash },
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
            isLocked: level <= 2,
            accountType: a.type,
            parentId: parentCode ? (await tx.chartOfAccount.findFirst({ where: { tenantId, code: parentCode }, select: { id: true } }))?.id ?? null : null,
          },
        });
      }
      await tx.costCenter.create({ data: { tenantId, code: "HQ", name: "الفرع الرئيسي", level: 1 } });

      return { tenantId, userId: user.id, roleId: role.id };
    });
  }
}
