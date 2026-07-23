import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { generateTotpSecret, otpauthUri, verifyTotp } from "../../common/security/totp";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import { RateLimitService } from "../../common/security/rate-limit.service";
import { TenantAccessService } from "../access/tenant-access.service";
import { CrRegistryService } from "../verification/cr-registry.service";
import type { TenantStatusDto, UpdateEntitlementDto, UpdatePlanDto } from "./dto/platform.dto";

/**
 * لوحة السوبر أدمن (المرحلة 8أ) — عابرة للمستأجرين. كل استعلاماتها غير مفلترة
 * (سياق المنصّة بلا tenantId) لرؤية كل المستأجرين وإدارة الباقات والاستخدام.
 */
@Injectable()
export class PlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly rateLimit: RateLimitService,
    private readonly access: TenantAccessService,
    private readonly crRegistry: CrRegistryService,
  ) {}

  /** وصف سجلّ السجلات التجارية المرجعي (العدد + اللقطة/المصدر) — للعرض في لوحة السوبر أدمن. */
  crRegistryMeta() {
    return this.crRegistry.meta();
  }

  /**
   * **استيراد دفعة سجلات تجارية** (السوبر أدمن) — upsert برقم السجل، فتُضاف الجديدة وتُحدَّث القائمة.
   * تقبل مفاتيح الأعمدة العربية للداتاست أو مرادفاتها الإنجليزية (مطابِقة للقالب القابل للتنزيل).
   * تُرسل الواجهة الملفّ على دُفعات؛ كل نداء يُدقَّق ويُعيد العدد المُستورَد والإجمالي الحالي.
   */
  async importCrRegistry(adminId: string, rows: Array<Record<string, unknown>>, source?: string) {
    const { imported } = await this.crRegistry.importRows(rows, source && source.trim() ? source.trim() : "manual_import");
    const { count } = await this.crRegistry.meta();
    await this.audit.log({ tenantId: "platform", userId: adminId, action: "import", entity: "cr_registry", entityId: "cr_registry", meta: { imported, total: count, source: source ?? null } });
    return { imported, total: count };
  }

  async login(email: string, password: string, mfaCode?: string) {
    await this.rateLimit.assertNotLocked("login", email);
    const admin = await this.prisma.platformAdmin.findFirst({ where: { email } });
    if (!admin?.passwordHash || !(await bcrypt.compare(password, admin.passwordHash))) {
      await this.rateLimit.recordFailure("login", email);
      throw new UnauthorizedException("بيانات الدخول غير صحيحة");
    }
    // المصادقة الثنائية (إن كانت مفعّلة)
    if (admin.mfaEnabled) {
      if (!mfaCode) throw new UnauthorizedException("MFA_REQUIRED"); // الواجهة تكشفها فتطلب الرمز
      if (!admin.mfaSecret || !verifyTotp(admin.mfaSecret, mfaCode)) {
        await this.rateLimit.recordFailure("login", email);
        throw new UnauthorizedException("رمز المصادقة الثنائية غير صحيح");
      }
    }
    await this.rateLimit.clear("login", email);
    const accessToken = await this.jwt.signAsync({ sub: admin.id, scope: "platform", email: admin.email });
    return { accessToken, admin: { id: admin.id, email: admin.email, fullName: admin.fullName, mfaEnabled: admin.mfaEnabled } };
  }

  /** حالة المصادقة الثنائية للأدمن الحالي. */
  async mfaStatus(adminId: string) {
    const admin = await this.prisma.platformAdmin.findFirst({ where: { id: adminId }, select: { mfaEnabled: true } });
    return { enabled: admin?.mfaEnabled ?? false };
  }

  /** بدء إعداد MFA: يولّد سرًّا (غير مفعّل بعد) ويعيد رابط otpauth للتطبيق. */
  async setupMfa(adminId: string) {
    const admin = await this.prisma.platformAdmin.findFirst({ where: { id: adminId }, select: { email: true, mfaEnabled: true } });
    if (!admin) throw new NotFoundException("الأدمن غير موجود");
    if (admin.mfaEnabled) throw new BadRequestException("المصادقة الثنائية مفعّلة مسبقاً");
    const secret = generateTotpSecret();
    await this.prisma.platformAdmin.update({ where: { id: adminId }, data: { mfaSecret: secret } });
    return { secret, otpauthUri: otpauthUri(secret, admin.email) };
  }

  /** تفعيل MFA بعد التحقّق من رمز من التطبيق. */
  async enableMfa(adminId: string, code: string) {
    const admin = await this.prisma.platformAdmin.findFirst({ where: { id: adminId }, select: { mfaSecret: true } });
    if (!admin?.mfaSecret) throw new BadRequestException("ابدأ الإعداد أولاً");
    if (!verifyTotp(admin.mfaSecret, code)) throw new UnauthorizedException("رمز غير صحيح");
    await this.prisma.platformAdmin.update({ where: { id: adminId }, data: { mfaEnabled: true } });
    await this.audit.log({ tenantId: "platform", userId: adminId, action: "update", entity: "platform_mfa", entityId: adminId, meta: { enabled: true } });
    return { enabled: true };
  }

  /** تعطيل MFA (يتطلّب رمزاً صحيحاً حالياً). */
  async disableMfa(adminId: string, code: string) {
    const admin = await this.prisma.platformAdmin.findFirst({ where: { id: adminId }, select: { mfaSecret: true, mfaEnabled: true } });
    if (!admin?.mfaEnabled || !admin.mfaSecret) throw new BadRequestException("غير مفعّلة");
    if (!verifyTotp(admin.mfaSecret, code)) throw new UnauthorizedException("رمز غير صحيح");
    await this.prisma.platformAdmin.update({ where: { id: adminId }, data: { mfaEnabled: false, mfaSecret: null } });
    await this.audit.log({ tenantId: "platform", userId: adminId, action: "update", entity: "platform_mfa", entityId: adminId, meta: { enabled: false } });
    return { enabled: false };
  }

  async tenants() {
    const rows = await this.prisma.tenant.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true, name: true, nameEn: true, status: true, billingModel: true, crNumber: true, createdAt: true,
        subscription: { select: { seatsUsed: true, cycle: true, renewsAt: true, plan: { select: { code: true, name: true, seatLimit: true } } } },
        // مالك الحساب (سوبر أدمن الشركة) = أوّل مستخدم أُنشئ للمستأجر
        users: { orderBy: { createdAt: "asc" }, take: 1, select: { fullName: true, email: true } },
        _count: { select: { users: true, clients: true, policies: true } },
      },
    });
    // حالة الوصول الفعّالة لكل مستأجر (تجربة/اشتراك ومتى ينتهي + الأيام المتبقية) — لرؤية الانتهاء في القائمة
    return Promise.all(rows.map(async ({ users, ...t }) => {
      const acc = await this.access.resolve(t.id);
      return { ...t, owner: users[0] ?? null, access: this.accessView(acc, t.subscription?.renewsAt ?? null) };
    }));
  }

  /** يعرض حالة الوصول للوحة المنصّة — يُظهر تاريخ الانتهاء دائمًا (حتى إن كان أبعد من نافذة التنبيه). */
  private accessView(acc: { state: string; trialEndsAt: Date | null; daysLeft: number | null }, renewsAt: Date | null) {
    const endsAt = acc.trialEndsAt ?? renewsAt ?? null;
    const daysLeft = acc.daysLeft ?? (endsAt ? Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86_400_000) : null);
    return { state: acc.state, endsAt, daysLeft };
  }

  async tenant(id: string) {
    const t = await this.prisma.tenant.findFirst({
      where: { id },
      select: {
        id: true, name: true, nameEn: true, status: true, billingModel: true, crNumber: true, createdAt: true,
        subscription: { select: { seatsUsed: true, seatsLicensed: true, cycle: true, startedAt: true, renewsAt: true, plan: { select: { code: true, name: true, seatLimit: true, trialDays: true } } } },
        // كل حسابات الشركة + أدوارهم (الأوّل = مالك الحساب/سوبر أدمن الشركة)
        users: {
          orderBy: { createdAt: "asc" },
          select: { id: true, fullName: true, email: true, status: true, createdAt: true, role: { select: { name: true } } },
        },
        _count: { select: { users: true, clients: true, policyRequests: true, policies: true, claims: true } },
      },
    });
    if (!t) throw new NotFoundException("المستأجر غير موجود");
    const { users, ...rest } = t;
    const acc = await this.access.resolve(id);
    return { ...rest, owner: users[0] ?? null, users, access: this.accessView(acc, rest.subscription?.renewsAt ?? null) };
  }

  /** تغيير باقة اشتراك مستأجر (سوبر أدمن) — يبدّل `planId` (+الدورة اختياريًا)، يُبطل كاش الوصول، ويُدقَّق. */
  async changeTenantPlan(adminId: string, tenantId: string, planCode: string, cycle?: "MONTHLY" | "YEARLY") {
    const [tenant, plan, sub] = await Promise.all([
      this.prisma.tenant.findFirst({ where: { id: tenantId }, select: { id: true } }),
      this.prisma.plan.findFirst({ where: { code: planCode }, select: { id: true, name: true } }),
      this.prisma.subscription.findFirst({ where: { tenantId }, select: { id: true, plan: { select: { code: true } } } }),
    ]);
    if (!tenant) throw new NotFoundException("المستأجر غير موجود");
    if (!plan) throw new NotFoundException("الباقة غير موجودة");
    if (!sub) throw new BadRequestException("لا اشتراك لهذا المستأجر");
    await this.prisma.subscription.update({ where: { id: sub.id }, data: { planId: plan.id, ...(cycle ? { cycle } : {}) } });
    this.access.invalidate(tenantId); // الميزات/الخفض تُحسب من الباقة ⇒ يسري فورًا
    await this.audit.log({ tenantId, userId: adminId, action: "update", entity: "tenant_plan", entityId: tenantId, meta: { by: "platform", from: sub.plan.code, to: planCode, cycle } });
    return { tenantId, planCode, planName: plan.name, cycle };
  }

  /**
   * ضبط/تمديد تاريخ تجديد اشتراك مستأجر (سوبر أدمن) — تاريخ صريح أو تمديد بعدد أشهر من الأبعد بين (الآن، التجديد الحالي).
   * يضمن الحالة `ACTIVE` ويُبطل الكاش ⇒ يرفع أي حجب انتهاء فورًا. لمنح فترة سماح/تمديد يدوي.
   */
  async setRenewal(adminId: string, tenantId: string, dto: { renewsAt?: string; months?: number }) {
    const sub = await this.prisma.subscription.findFirst({ where: { tenantId }, select: { id: true, renewsAt: true } });
    if (!sub) throw new BadRequestException("لا اشتراك لهذا المستأجر");
    let renewsAt: Date;
    if (dto.renewsAt) {
      renewsAt = new Date(dto.renewsAt);
      if (Number.isNaN(renewsAt.getTime())) throw new BadRequestException("تاريخ غير صالح");
    } else if (dto.months) {
      const from = sub.renewsAt && sub.renewsAt.getTime() > Date.now() ? new Date(sub.renewsAt) : new Date();
      from.setMonth(from.getMonth() + dto.months);
      renewsAt = from;
    } else {
      throw new BadRequestException("مرّر renewsAt أو months");
    }
    await this.prisma.$transaction([
      this.prisma.subscription.update({ where: { id: sub.id }, data: { renewsAt } }),
      this.prisma.tenant.update({ where: { id: tenantId }, data: { status: "ACTIVE" } }),
    ]);
    this.access.invalidate(tenantId);
    await this.audit.log({ tenantId, userId: adminId, action: "update", entity: "tenant_renewal", entityId: tenantId, meta: { by: "platform", renewsAt: renewsAt.toISOString(), months: dto.months } });
    return { tenantId, renewsAt, status: "ACTIVE" };
  }

  async setStatus(adminId: string, id: string, dto: TenantStatusDto) {
    const exists = await this.prisma.tenant.findFirst({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException("المستأجر غير موجود");
    await this.prisma.tenant.update({ where: { id }, data: { status: dto.status } });
    this.access.invalidate(id); // يفرض/يرفع الحجب فورًا (تعليق/إعادة تفعيل)
    await this.audit.log({ tenantId: id, userId: adminId, action: "update", entity: "tenant_status", entityId: id, meta: { status: dto.status, by: "platform" } });
    return { id, status: dto.status };
  }

  /**
   * **الدخول كالحساب (انتحال)** — يُصدر توكن مستأجر لمالك الشركة (أول مستخدم نشِط) موسومًا بـ`imp=adminId`
   * وبصلاحية قصيرة (60 دقيقة). كل عملية انتحال تُسجَّل في التدقيق. الواجهة تعرض بانرًا دائمًا مع «العودة للوحة المنصّة».
   * لا يُلمَس رمز السوبر أدمن (محفوظ بمفتاح منفصل)، فالعودة = حذف توكن الانتحال والرجوع.
   */
  async impersonate(adminId: string, tenantId: string) {
    const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId }, select: { id: true, name: true, nameEn: true } });
    if (!tenant) throw new NotFoundException("المستأجر غير موجود");
    const owner = await this.prisma.user.findFirst({
      where: { tenantId, status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
      select: { id: true, fullName: true, email: true, roleId: true },
    });
    if (!owner) throw new BadRequestException("لا يوجد مستخدم نشِط في هذا الحساب للدخول كه");
    const accessToken = await this.jwt.signAsync(
      { sub: owner.id, tenantId, roleId: owner.roleId ?? null, email: owner.email, sid: `imp-${adminId.slice(0, 8)}`, imp: adminId },
      { expiresIn: "60m" },
    );
    await this.audit.log({ tenantId, userId: adminId, action: "login", entity: "tenant_impersonate", entityId: tenantId, meta: { by: "platform", actingAs: owner.email } });
    return { accessToken, tenant, actingAs: { id: owner.id, fullName: owner.fullName, email: owner.email } };
  }

  plans() {
    return this.prisma.plan.findMany({
      orderBy: { priceMonthly: "asc" },
      select: {
        id: true, code: true, name: true, seatLimit: true, priceMonthly: true, priceYearly: true, trialDays: true, slaResponseHours: true,
        entitlements: { orderBy: { featureKey: "asc" }, select: { featureKey: true, mode: true, numericValue: true, unitFee: true } },
        _count: { select: { subscriptions: true } },
      },
    });
  }

  /** تعديل إعدادات الباقة — أهمّها **حدّ المستخدمين (seatLimit)** الذي يضبطه سوبر أدمن المنصّة. */
  async updatePlan(planCode: string, dto: UpdatePlanDto, adminId: string) {
    const plan = await this.prisma.plan.findFirst({ where: { code: planCode }, select: { id: true } });
    if (!plan) throw new NotFoundException("الباقة غير موجودة");
    const data: { seatLimit?: number; name?: string; priceMonthly?: number; priceYearly?: number; trialDays?: number; slaResponseHours?: number } = {};
    if (dto.seatLimit !== undefined) data.seatLimit = dto.seatLimit;
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.priceMonthly !== undefined) data.priceMonthly = dto.priceMonthly;
    if (dto.priceYearly !== undefined) data.priceYearly = dto.priceYearly;
    if (dto.trialDays !== undefined) data.trialDays = dto.trialDays;
    if (dto.slaResponseHours !== undefined) data.slaResponseHours = dto.slaResponseHours;
    if (Object.keys(data).length === 0) throw new BadRequestException("لا حقول للتحديث");
    const updated = await this.prisma.plan.update({
      where: { id: plan.id },
      data,
      select: { code: true, name: true, seatLimit: true, priceMonthly: true, priceYearly: true, trialDays: true, slaResponseHours: true },
    });
    await this.audit.log({ tenantId: "platform", userId: adminId, action: "update", entity: "plan", entityId: planCode, meta: { ...data } });
    return updated;
  }

  async updateEntitlement(planCode: string, dto: UpdateEntitlementDto) {
    const plan = await this.prisma.plan.findFirst({ where: { code: planCode } });
    if (!plan) throw new NotFoundException("الباقة غير موجودة");
    return this.prisma.entitlement.upsert({
      where: { planId_featureKey: { planId: plan.id, featureKey: dto.featureKey } },
      update: { mode: dto.mode, numericValue: dto.numericValue ?? null, unitFee: dto.unitFee ?? null },
      create: { planId: plan.id, featureKey: dto.featureKey, mode: dto.mode, numericValue: dto.numericValue ?? null, unitFee: dto.unitFee ?? null },
      select: { featureKey: true, mode: true, numericValue: true, unitFee: true },
    });
  }

  /**
   * مراجعة/تصدير سجل التدقيق (لمفتّشي الهيئة) — نطاق المنصّة عابر للمستأجرين.
   * السجلّ غير قابل للتعديل/الحذف (يُفرض في Prisma). فلترة اختيارية بالمستأجر.
   */
  auditLogs(tenantId?: string, limit = 200) {
    return this.prisma.auditLog.findMany({
      where: tenantId ? { tenantId } : {},
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(1, limit), 1000),
      select: { id: true, tenantId: true, userId: true, action: true, entity: true, entityId: true, ipAddress: true, userAgent: true, createdAt: true },
    });
  }

  /**
   * لوحة القيادة (360°) — نظرة شاملة على صحّة المنصّة: توزيع الحالات، تقدير الإيراد الشهري المتكرّر (MRR)،
   * الاشتراكات المنتهية/الوشيكة خلال 30 يومًا (تحتاج متابعة)، أحدث التسجيلات، وطلبات التواصل الجديدة.
   */
  async overview() {
    const now = Date.now();
    const soonMs = now + 30 * 86_400_000;
    const [tenants, newLeads, recent] = await Promise.all([
      this.prisma.tenant.findMany({
        select: {
          id: true, name: true, status: true, createdAt: true,
          subscription: { select: { seatsLicensed: true, cycle: true, startedAt: true, renewsAt: true, plan: { select: { code: true, name: true, priceMonthly: true, priceYearly: true, trialDays: true } } } },
        },
      }),
      this.prisma.lead.count({ where: { status: "new" } }),
      this.prisma.tenant.findMany({ orderBy: { createdAt: "desc" }, take: 6, select: { id: true, name: true, status: true, createdAt: true, users: { orderBy: { createdAt: "asc" }, take: 1, select: { email: true } } } }),
    ]);

    const byStatus: Record<string, number> = { ACTIVE: 0, TRIAL: 0, SUSPENDED: 0, CANCELLED: 0 };
    let mrr = 0;
    const expiring: Array<{ id: string; name: string; kind: "trial" | "subscription"; endsAt: Date; daysLeft: number }> = [];
    for (const t of tenants) {
      byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
      const sub = t.subscription;
      if (!sub) continue;
      // MRR: الاشتراكات المدفوعة النشطة فقط (شهري = السعر×المقاعد؛ سنوي = السنوي/12×المقاعد)
      if (t.status === "ACTIVE") {
        const seats = sub.seatsLicensed || 0;
        const monthly = sub.cycle === "YEARLY" ? Number(sub.plan.priceYearly) / 12 : Number(sub.plan.priceMonthly);
        mrr += monthly * seats;
      }
      // الوشيك على الانتهاء: تجربة (startedAt+trialDays) أو اشتراك (renewsAt) خلال 30 يومًا
      let endsAt: Date | null = null;
      let kind: "trial" | "subscription" = "subscription";
      if (t.status === "TRIAL" && sub.startedAt && sub.plan.trialDays > 0) {
        endsAt = new Date(sub.startedAt); endsAt.setDate(endsAt.getDate() + sub.plan.trialDays); kind = "trial";
      } else if (t.status === "ACTIVE" && sub.renewsAt) {
        endsAt = sub.renewsAt; kind = "subscription";
      }
      if (endsAt && endsAt.getTime() <= soonMs) {
        expiring.push({ id: t.id, name: t.name, kind, endsAt, daysLeft: Math.ceil((endsAt.getTime() - now) / 86_400_000) });
      }
    }
    expiring.sort((a, b) => a.endsAt.getTime() - b.endsAt.getTime());
    const recentSignups = recent.map(({ users, ...r }) => ({ ...r, ownerEmail: users[0]?.email ?? null }));
    return { byStatus, mrr: Math.round(mrr), expiring, recentSignups, newLeads };
  }

  /** استخدام المنصّة (عبر كل المستأجرين — استعلامات غير مفلترة). */
  async usage() {
    const [tenants, users, clients, policies, requests, claims, verificationChecks] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.user.count(),
      this.prisma.client.count(),
      this.prisma.policy.count(),
      this.prisma.policyRequest.count(),
      this.prisma.claim.count(),
      this.prisma.verificationCheck.count(),
    ]);
    return { tenants, users, clients, policies, requests, claims, verificationChecks };
  }

  /** طلبات التواصل مع المبيعات (Leads) — عابرة للمستأجرين، أحدث أولًا. */
  leads() {
    return this.prisma.lead.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { id: true, name: true, email: true, company: true, phone: true, planCode: true, seats: true, message: true, status: true, createdAt: true },
    });
  }

  /** تحديث حالة طلب تواصل (new | contacted | closed). */
  async updateLeadStatus(id: string, status: string, adminId: string) {
    const allowed = ["new", "contacted", "closed"];
    if (!allowed.includes(status)) throw new BadRequestException("حالة غير معروفة");
    const lead = await this.prisma.lead.findFirst({ where: { id }, select: { id: true } });
    if (!lead) throw new NotFoundException("الطلب غير موجود");
    await this.prisma.lead.update({ where: { id }, data: { status } });
    await this.audit.log({ tenantId: "platform", userId: adminId, action: "update", entity: "lead", entityId: id, meta: { status } });
    return { id, status };
  }
}
