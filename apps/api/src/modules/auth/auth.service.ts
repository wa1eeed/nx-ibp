import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  /**
   * تسجيل الدخول. يجري بلا سياق مستأجر (لا توكن بعد)، فالبحث بالبريد غير مفلتر —
   * بريد المستخدم يحدّد مستأجره، ثم نُصدر توكناً يحمل tenantId.
   */
  async login(email: string, password: string) {
    const user = await this.prisma.user.findFirst({ where: { email, status: "ACTIVE" } });
    if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException("بيانات الدخول غير صحيحة");
    }

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
    return this.prisma.user.findFirst({
      where: { id: userId },
      select: { id: true, email: true, fullName: true, tenantId: true, roleId: true, status: true },
    });
  }
}
