/**
 * اختبار المصادقة الثنائية لموظفي الشركات (TOTP) — تحقّق:
 *  - تسجيل ذاتي: setup ⇒ enable برمز صحيح (رمز خاطئ ⇒ رفض).
 *  - تحدّي الدخول من خطوتين: بعد التفعيل، كلمة المرور وحدها ⇒ MFA_REQUIRED؛ مع الرمز ⇒ نجاح.
 *  - إلزام الشركة (سياسة أمان): من لم يُفعّل ⇒ mfaEnrollmentRequired؛ ومنع إلغاء التفعيل تحت الإلزام.
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { totp } from "../src/common/security/totp";

describe("MFA للموظفين (e2e)", () => {
  let app: INestApplication;
  let gm: string; // مدير عام (له settings) — يضبط سياسة الأمان
  let userEmail = "", userToken = "", noEnrollEmail = "";

  const srv = () => app.getHttpServer();
  const login = (email: string, password = "Passw0rd!", mfaCode?: string) =>
    request(srv()).post("/auth/login").send({ email, password, ...(mfaCode ? { mfaCode } : {}) });
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const perm = (module: string, canAccess: boolean, canCreate = false) => ({ module, canAccess, canCreate, canEdit: false, canDelete: false, canRevert: false });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    gm = (await login("waleed@gulf-demo.sa")).body.accessToken;
    const uniq = String(Date.now()).slice(-8);
    userEmail = `mfa-user-${uniq}@gulf-demo.sa`;
    noEnrollEmail = `mfa-noenroll-${uniq}@gulf-demo.sa`;
    for (const email of [userEmail, noEnrollEmail]) {
      await request(srv()).post("/staff").set(auth(gm)).send({ fullName: "موظف MFA", email, password: "Passw0rd1", roleName: `دور-${email}`, permissions: [perm("dashboard", true)] }).expect(201);
    }
    userToken = (await login(userEmail, "Passw0rd1")).body.accessToken;
  });

  afterAll(async () => {
    // إعادة سياسة الأمان لوضعها الافتراضي (المستأجر مشترك بين ملفات الاختبار)
    await request(srv()).put("/config/security").set(auth(gm)).send({ mfaRequired: false });
    await app?.close();
  });

  it("الحالة الابتدائية: غير مفعّلة وغير مُلزَمة", async () => {
    const res = await request(srv()).get("/auth/mfa/status").set(auth(userToken)).expect(200);
    expect(res.body).toEqual({ enabled: false, required: false });
  });

  let secret = "";
  it("الإعداد ثم التفعيل: رمز خاطئ ⇒ 401، رمز صحيح ⇒ مفعّلة", async () => {
    secret = (await request(srv()).post("/auth/mfa/setup").set(auth(userToken)).expect(201)).body.secret;
    expect(secret).toMatch(/^[A-Z2-7]+$/); // Base32

    await request(srv()).post("/auth/mfa/enable").set(auth(userToken)).send({ code: "000000" }).expect(401);

    const res = await request(srv()).post("/auth/mfa/enable").set(auth(userToken)).send({ code: totp(secret) }).expect(201);
    expect(res.body).toEqual({ ok: true, enabled: true });
    expect((await request(srv()).get("/auth/mfa/status").set(auth(userToken))).body.enabled).toBe(true);
  });

  it("تحدّي الدخول: كلمة المرور وحدها ⇒ MFA_REQUIRED؛ مع الرمز ⇒ نجاح؛ رمز خاطئ ⇒ 401", async () => {
    const noCode = await login(userEmail, "Passw0rd1").expect(401);
    expect(noCode.body.message).toBe("MFA_REQUIRED");

    await login(userEmail, "Passw0rd1", "123456").expect(401); // رمز خاطئ

    const ok = await login(userEmail, "Passw0rd1", totp(secret)).expect(201);
    expect(ok.body.accessToken).toBeTruthy();
    expect(ok.body.user.mfaEnabled).toBe(true);
  });

  it("إلزام الشركة: من لم يُفعّل ⇒ mfaEnrollmentRequired، ومنع إلغاء التفعيل تحت الإلزام", async () => {
    await request(srv()).put("/config/security").set(auth(gm)).send({ mfaRequired: true }).expect(200);

    // مستخدم لم يُفعّل بعد: الدخول ينجح لكن يُطالَب بالتسجيل
    const noEnroll = await login(noEnrollEmail, "Passw0rd1").expect(201);
    expect(noEnroll.body.mfaEnrollmentRequired).toBe(true);

    // المستخدم المفعّل لا يستطيع الإلغاء تحت الإلزام ⇒ 400
    await request(srv()).post("/auth/mfa/disable").set(auth(userToken)).send({ code: totp(secret) }).expect(400);
  });

  it("رفع الإلزام ثم إلغاء التفعيل برمز صحيح ⇒ يعود الدخول بكلمة المرور وحدها", async () => {
    await request(srv()).put("/config/security").set(auth(gm)).send({ mfaRequired: false }).expect(200);

    await request(srv()).post("/auth/mfa/disable").set(auth(userToken)).send({ code: totp(secret) }).expect(201);
    expect((await request(srv()).get("/auth/mfa/status").set(auth(userToken))).body.enabled).toBe(false);

    // بعد الإلغاء: الدخول بكلمة المرور وحدها ينجح
    await login(userEmail, "Passw0rd1").expect(201);
  });

  it("عزل: بلا صلاحية الإعدادات لا يضبط سياسة الأمان ⇒ 403", () =>
    request(srv()).put("/config/security").set(auth(userToken)).send({ mfaRequired: true }).expect(403));

  it("أدمن الشركة يعيد تعيين مصادقة موظف (فقدان جهاز) ⇒ يعود دخوله بكلمة المرور وحدها", async () => {
    // فعّل MFA للمستخدم الثاني، فيصير دخوله يتطلّب رمزًا
    const ntok = (await login(noEnrollEmail, "Passw0rd1")).body.accessToken as string;
    const secret = (await request(srv()).post("/auth/mfa/setup").set(auth(ntok)).expect(201)).body.secret;
    await request(srv()).post("/auth/mfa/enable").set(auth(ntok)).send({ code: totp(secret) }).expect(201);
    expect((await login(noEnrollEmail, "Passw0rd1").expect(401)).body.message).toBe("MFA_REQUIRED");
    const meId = (await request(srv()).get("/auth/me").set(auth(ntok)).expect(200)).body.id as string;

    // موظف بلا صلاحية الإعدادات لا يعيد التعيين ⇒ 403
    await request(srv()).post(`/staff/${meId}/mfa/reset`).set(auth(userToken)).expect(403);

    // أدمن (gm، settings) يعيد التعيين ⇒ يعود الدخول بكلمة المرور وحدها
    await request(srv()).post(`/staff/${meId}/mfa/reset`).set(auth(gm)).expect(200);
    await login(noEnrollEmail, "Passw0rd1").expect(201);
  });
});
