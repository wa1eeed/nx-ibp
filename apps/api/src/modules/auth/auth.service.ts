import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import { RateLimitService } from "../../common/security/rate-limit.service";
import { generateTotpSecret, otpauthUri, verifyTotp } from "../../common/security/totp";

/** مدّة صلاحية رمز التحديث (أيام). */
const REFRESH_DAYS = 7;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly rateLimit: RateLimitService,
  ) {}

  /** هل تُلزِم الشركة موظفيها بالمصادقة الثنائية؟ (سياسة أمان على مستوى المستأجر). */
  private async mfaRequiredFor(tenantId: string): Promise<boolean> {
    const cfg = await this.prisma.tenantConfig.findFirst({ where: { tenantId }, select: { securityPolicy: true } });
    return ((cfg?.securityPolicy ?? {}) as { mfaRequired?: boolean }).mfaRequired === true;
  }

  /**
   * تسجيل الدخول. يجري بلا سياق مستأجر (لا توكن بعد)، فالبحث بالبريد غير مفلتر —
   * بريد المستخدم يحدّد مستأجره، ثم نُصدر توكناً يحمل tenantId.
   * إن كانت المصادقة الثنائية مفعّلة للمستخدم، يلزم رمز TOTP صحيح (تحدٍّ من خطوتين).
   */
  async login(email: string, password: string, mfaCode?: string) {
    await this.rateLimit.assertNotLocked("login", email); // حماية القوّة الغاشمة
    const user = await this.prisma.user.findFirst({ where: { email, status: "ACTIVE" } });
    if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      await this.rateLimit.recordFailure("login", email);
      throw new UnauthorizedException("بيانات الدخول غير صحيحة");
    }

    // كلمة المرور صحيحة — تحدّي المصادقة الثنائية إن كانت مفعّلة للمستخدم
    if (user.mfaEnabled) {
      if (!mfaCode) throw new UnauthorizedException("MFA_REQUIRED"); // الواجهة تكشفها فتطلب الرمز
      if (!user.mfaSecret || !verifyTotp(user.mfaSecret, mfaCode)) {
        await this.rateLimit.recordFailure("login", email); // رمز خاطئ يُحتسب محاولة فاشلة
        throw new UnauthorizedException("رمز التحقّق غير صحيح");
      }
    }
    await this.rateLimit.clear("login", email); // نجاح كامل ⇒ تصفير العدّاد

    const accessToken = await this.signAccess(user);
    const refreshToken = await this.issueRefresh(user.id);

    // تسجيل دخول ناجح في سجل التدقيق (لا سياق مستأجر بعد ⇒ نمرّره صراحةً)
    await this.audit.log({ tenantId: user.tenantId, userId: user.id, action: "login", entity: "auth", entityId: user.id });

    // إلزام الشركة بالـMFA ولم يُفعّلها المستخدم بعد ⇒ إشارة للواجهة لدفعه للتسجيل قبل المتابعة
    const mfaEnrollmentRequired = !user.mfaEnabled && (await this.mfaRequiredFor(user.tenantId));

    return {
      accessToken,
      refreshToken,
      mfaEnrollmentRequired,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        tenantId: user.tenantId,
        roleId: user.roleId,
        mfaEnabled: user.mfaEnabled,
      },
    };
  }

  /** يوقّع رمز الوصول (access JWT) من بيانات المستخدم — مع معرّف جلسة (sid) للتدقيق. */
  private signAccess(user: { id: string; tenantId: string; roleId: string | null; email: string }) {
    return this.jwt.signAsync({ sub: user.id, tenantId: user.tenantId, roleId: user.roleId ?? null, email: user.email, sid: randomBytes(12).toString("hex") });
  }

  /** يُصدر رمز تحديث خامًا (يُعاد للعميل مرّة واحدة) ويُخزّن **جزيئته** فقط. */
  private async issueRefresh(userId: string): Promise<string> {
    const raw = randomBytes(32).toString("hex");
    await this.prisma.refreshToken.create({ data: { userId, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + REFRESH_DAYS * 86_400_000) } });
    return raw;
  }

  /**
   * تدوير الجلسة: يستبدل رمز تحديث صالحًا برمز وصول جديد **ورمز تحديث جديد**، ويُبطِل القديم.
   * الرمز المُبطَل/المنتهي/المجهول ⇒ 401. يُشغَّل بلا سياق مستأجر (بوّابة عامة كالدخول).
   */
  async refresh(token: string) {
    if (!token) throw new UnauthorizedException("رمز تحديث مطلوب");
    const row = await this.prisma.refreshToken.findFirst({ where: { tokenHash: sha256(token) } });
    if (!row || row.revokedAt || +row.expiresAt < Date.now()) throw new UnauthorizedException("رمز التحديث غير صالح");
    const user = await this.prisma.user.findFirst({ where: { id: row.userId, status: "ACTIVE" }, select: { id: true, tenantId: true, roleId: true, email: true } });
    if (!user) throw new UnauthorizedException("الحساب غير نشط");
    // تدوير: أبطِل القديم وأصدر جديدًا (اكتشاف إعادة الاستخدام يبقى بسيطًا — القديم لن يُقبل ثانيةً)
    await this.prisma.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
    const accessToken = await this.signAccess(user);
    const refreshToken = await this.issueRefresh(user.id);
    await this.audit.log({ tenantId: user.tenantId, userId: user.id, action: "login", entity: "auth_refresh", entityId: user.id });
    return { accessToken, refreshToken };
  }

  /** خروج: إبطال رمز التحديث (إن مُرِّر). idempotent. */
  async logout(token?: string) {
    if (token) await this.prisma.refreshToken.updateMany({ where: { tokenHash: sha256(token), revokedAt: null }, data: { revokedAt: new Date() } });
    return { ok: true };
  }

  /** بيانات المستخدم الحالي — ضمن سياق المستأجر فتُفلتر تلقائياً. */
  async me(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId },
      select: {
        id: true, email: true, fullName: true, tenantId: true, roleId: true, status: true, mfaEnabled: true,
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
    const mfaEnrollmentRequired = !user.mfaEnabled && (await this.mfaRequiredFor(user.tenantId));
    // مفاتيح المميزات/الموديولز المفعّلة في باقة المستأجر (+ الإضافات المشتراة) — لتُخفي الواجهة ما ليس ضمن الباقة.
    const sub = await this.prisma.subscription.findFirst({
      where: { tenantId: user.tenantId },
      include: { plan: { select: { entitlements: { select: { featureKey: true, mode: true } } } }, addons: { select: { addonKey: true } } },
    });
    const purchased = new Set(sub?.addons.map((a) => a.addonKey) ?? []);
    const features = [
      ...new Set([
        ...purchased,
        ...(sub?.plan.entitlements ?? [])
          .filter((e) => purchased.has(e.featureKey) || e.mode === "INCLUDED" || e.mode === "QUOTA" || e.mode === "METERED")
          .map((e) => e.featureKey),
      ]),
    ];
    return { ...rest, roleName: role?.name ?? null, permissions, features, mfaEnrollmentRequired };
  }

  // ————————————————— المصادقة الثنائية (TOTP) للموظف —————————————————

  /** حالة المصادقة الثنائية للمستخدم + إلزام الشركة. */
  async mfaStatus(userId: string, tenantId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId }, select: { mfaEnabled: true } });
    return { enabled: user?.mfaEnabled ?? false, required: await this.mfaRequiredFor(tenantId) };
  }

  /** بدء الإعداد: يولّد سرّاً ويعيد رابط otpauth (QR) — لا يُفعّل حتى يؤكّد المستخدم برمز. */
  async setupMfa(userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId }, select: { email: true, mfaEnabled: true } });
    if (!user) throw new UnauthorizedException();
    if (user.mfaEnabled) throw new BadRequestException("المصادقة الثنائية مفعّلة مسبقاً");
    const secret = generateTotpSecret();
    await this.prisma.user.update({ where: { id: userId }, data: { mfaSecret: secret } });
    return { secret, otpauthUri: otpauthUri(secret, user.email, "IBP") };
  }

  /** تفعيل بعد التحقّق من رمز من تطبيق المصادقة. */
  async enableMfa(userId: string, tenantId: string, code: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId }, select: { mfaSecret: true } });
    if (!user?.mfaSecret) throw new BadRequestException("ابدأ الإعداد أولاً");
    if (!verifyTotp(user.mfaSecret, code)) throw new UnauthorizedException("رمز غير صحيح");
    await this.prisma.user.update({ where: { id: userId }, data: { mfaEnabled: true } });
    await this.audit.log({ tenantId, userId, action: "update", entity: "user_mfa", entityId: userId, meta: { enabled: true } });
    return { ok: true, enabled: true };
  }

  /** إلغاء التفعيل بعد التحقّق — ممنوع إن كانت الشركة تُلزم بالـMFA. */
  async disableMfa(userId: string, tenantId: string, code: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId }, select: { mfaSecret: true, mfaEnabled: true } });
    if (!user?.mfaEnabled || !user.mfaSecret) throw new BadRequestException("غير مفعّلة");
    if (await this.mfaRequiredFor(tenantId)) throw new BadRequestException("المصادقة الثنائية إلزامية على مستوى الشركة — لا يمكن إلغاؤها");
    if (!verifyTotp(user.mfaSecret, code)) throw new UnauthorizedException("رمز غير صحيح");
    await this.prisma.user.update({ where: { id: userId }, data: { mfaEnabled: false, mfaSecret: null } });
    await this.audit.log({ tenantId, userId, action: "update", entity: "user_mfa", entityId: userId, meta: { enabled: false } });
    return { ok: true, enabled: false };
  }
}
