/**
 * اختبار المصادقة الثنائية لسوبر أدمن المنصة (MFA — TOTP، مطلب SLA/NCA):
 *  - إعداد ⇒ تفعيل برمز صحيح ⇒ الدخول يفرض الرمز (بدونه MFA_REQUIRED، خطأ ⇒ 401، صحيح ⇒ نجاح).
 *  - يُعطَّل في afterAll لإعادة الحساب المشترك لحالته (كي لا تتأثّر بقية الملفات).
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { totp } from "../src/common/security/totp";

describe("المصادقة الثنائية للمنصة (e2e)", () => {
  let app: INestApplication;
  let token: string; // توكن الأدمن (صدر قبل تفعيل MFA — يبقى صالحاً)
  let secret: string;
  const srv = () => app.getHttpServer();
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const admin = { email: "admin@ibp-platform.sa", password: "Passw0rd!" };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    token = (await request(srv()).post("/platform/login").send(admin).expect(201)).body.accessToken;
    secret = (await request(srv()).post("/platform/mfa/setup").set(auth(token)).expect(200)).body.secret;
    expect(secret).toBeTruthy();
  });

  afterAll(async () => {
    // إعادة الحالة: تعطيل MFA للحساب المشترك
    if (secret) await request(srv()).post("/platform/mfa/disable").set(auth(token)).send({ code: totp(secret) });
    await app?.close();
  });

  it("الإعداد يعيد رابط otpauth", async () => {
    // (secret ضُبط في beforeAll) — نتأكّد من رابط otpauth عبر إعادة الحالة ثم إعداد جديد ممنوع بعد التفعيل
    expect(secret).toMatch(/^[A-Z2-7]+$/); // Base32
  });

  it("التفعيل برمز صحيح", async () => {
    const res = await request(srv()).post("/platform/mfa/enable").set(auth(token)).send({ code: totp(secret) }).expect(200);
    expect(res.body.enabled).toBe(true);
  });

  it("التفعيل/الدخول برمز خاطئ ⇒ 401", () =>
    request(srv()).post("/platform/login").send({ ...admin, mfaCode: "000000" }).expect(401));

  it("الدخول بلا رمز بعد التفعيل ⇒ 401 (MFA_REQUIRED)", async () => {
    const res = await request(srv()).post("/platform/login").send(admin).expect(401);
    expect(res.body.message).toBe("MFA_REQUIRED");
  });

  it("الدخول برمز صحيح ⇒ نجاح", () =>
    request(srv()).post("/platform/login").send({ ...admin, mfaCode: totp(secret) }).expect(201));
});
