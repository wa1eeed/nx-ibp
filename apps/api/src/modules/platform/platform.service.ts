import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { generateTotpSecret, otpauthUri, verifyTotp } from "../../common/security/totp";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import { RateLimitService } from "../../common/security/rate-limit.service";
import { TenantAccessService } from "../access/tenant-access.service";
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
  ) {}

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
        subscription: { select: { seatsUsed: true, cycle: true, plan: { select: { code: true, name: true, seatLimit: true } } } },
        // مالك الحساب (سوبر أدمن الشركة) = أوّل مستخدم أُنشئ للمستأجر
        users: { orderBy: { createdAt: "asc" }, take: 1, select: { fullName: true, email: true } },
        _count: { select: { users: true, clients: true, policies: true } },
      },
    });
    return rows.map(({ users, ...t }) => ({ ...t, owner: users[0] ?? null }));
  }

  async tenant(id: string) {
    const t = await this.prisma.tenant.findFirst({
      where: { id },
      select: {
        id: true, name: true, nameEn: true, status: true, billingModel: true, crNumber: true, createdAt: true,
        subscription: { select: { seatsUsed: true, cycle: true, renewsAt: true, plan: { select: { code: true, name: true, seatLimit: true } } } },
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
    return { ...rest, owner: users[0] ?? null, users };
  }

  async setStatus(adminId: string, id: string, dto: TenantStatusDto) {
    const exists = await this.prisma.tenant.findFirst({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException("المستأجر غير موجود");
    await this.prisma.tenant.update({ where: { id }, data: { status: dto.status } });
    this.access.invalidate(id); // يفرض/يرفع الحجب فورًا (تعليق/إعادة تفعيل)
    await this.audit.log({ tenantId: id, userId: adminId, action: "update", entity: "tenant_status", entityId: id, meta: { status: dto.status, by: "platform" } });
    return { id, status: dto.status };
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
