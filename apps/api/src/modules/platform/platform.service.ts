import { Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import type { TenantStatusDto, UpdateEntitlementDto } from "./dto/platform.dto";

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
  ) {}

  async login(email: string, password: string) {
    const admin = await this.prisma.platformAdmin.findFirst({ where: { email } });
    if (!admin?.passwordHash || !(await bcrypt.compare(password, admin.passwordHash))) {
      throw new UnauthorizedException("بيانات الدخول غير صحيحة");
    }
    const accessToken = await this.jwt.signAsync({ sub: admin.id, scope: "platform", email: admin.email });
    return { accessToken, admin: { id: admin.id, email: admin.email, fullName: admin.fullName } };
  }

  tenants() {
    return this.prisma.tenant.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true, name: true, nameEn: true, status: true, billingModel: true, crNumber: true, createdAt: true,
        subscription: { select: { seatsUsed: true, cycle: true, plan: { select: { code: true, name: true, seatLimit: true } } } },
        _count: { select: { users: true, clients: true, policies: true } },
      },
    });
  }

  async tenant(id: string) {
    const t = await this.prisma.tenant.findFirst({
      where: { id },
      select: {
        id: true, name: true, nameEn: true, status: true, billingModel: true, crNumber: true, createdAt: true,
        subscription: { select: { seatsUsed: true, cycle: true, renewsAt: true, plan: { select: { code: true, name: true, seatLimit: true } } } },
        _count: { select: { users: true, clients: true, policyRequests: true, policies: true, claims: true } },
      },
    });
    if (!t) throw new NotFoundException("المستأجر غير موجود");
    return t;
  }

  async setStatus(adminId: string, id: string, dto: TenantStatusDto) {
    const exists = await this.prisma.tenant.findFirst({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException("المستأجر غير موجود");
    await this.prisma.tenant.update({ where: { id }, data: { status: dto.status } });
    await this.audit.log({ tenantId: id, userId: adminId, action: "update", entity: "tenant_status", entityId: id, meta: { status: dto.status, by: "platform" } });
    return { id, status: dto.status };
  }

  plans() {
    return this.prisma.plan.findMany({
      orderBy: { priceMonthly: "asc" },
      select: {
        id: true, code: true, name: true, seatLimit: true, priceMonthly: true, priceYearly: true,
        entitlements: { orderBy: { featureKey: "asc" }, select: { featureKey: true, mode: true, numericValue: true, unitFee: true } },
        _count: { select: { subscriptions: true } },
      },
    });
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
}
