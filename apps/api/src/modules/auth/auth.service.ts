import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import { RateLimitService } from "../../common/security/rate-limit.service";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly rateLimit: RateLimitService,
  ) {}

  /**
   * تسجيل الدخول. يجري بلا سياق مستأجر (لا توكن بعد)، فالبحث بالبريد غير مفلتر —
   * بريد المستخدم يحدّد مستأجره، ثم نُصدر توكناً يحمل tenantId.
   */
  async login(email: string, password: string) {
    await this.rateLimit.assertNotLocked("login", email); // حماية القوّة الغاشمة
    const user = await this.prisma.user.findFirst({ where: { email, status: "ACTIVE" } });
    if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      await this.rateLimit.recordFailure("login", email);
      throw new UnauthorizedException("بيانات الدخول غير صحيحة");
    }
    await this.rateLimit.clear("login", email); // نجاح ⇒ تصفير العدّاد

    const payload = {
      sub: user.id,
      tenantId: user.tenantId,
      roleId: user.roleId ?? null,
      email: user.email,
    };
    const accessToken = await this.jwt.signAsync(payload);

    // تسجيل دخول ناجح في سجل التدقيق (لا سياق مستأجر بعد ⇒ نمرّره صراحةً)
    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.id,
      action: "login",
      entity: "auth",
      entityId: user.id,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        tenantId: user.tenantId,
        roleId: user.roleId,
      },
    };
  }

  /** بيانات المستخدم الحالي — ضمن سياق المستأجر فتُفلتر تلقائياً. */
  async me(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId },
      select: {
        id: true, email: true, fullName: true, tenantId: true, roleId: true, status: true,
        role: { select: { name: true, permissions: { select: { module: true, canAccess: true, canCreate: true, canEdit: true, canDelete: true, canRevert: true } } } },
      },
    });
    if (!user) return null;
    // خريطة صلاحيات مبسّطة للواجهة: module ⇒ {access,create,edit,delete,revert}
    const permissions: Record<string, { access: boolean; create: boolean; edit: boolean; delete: boolean; revert: boolean }> = {};
    for (const p of user.role?.permissions ?? []) {
      permissions[p.module] = { access: p.canAccess, create: p.canCreate, edit: p.canEdit, delete: p.canDelete, revert: p.canRevert };
    }
    const { role, ...rest } = user;
    return { ...rest, roleName: role?.name ?? null, permissions };
  }
}
