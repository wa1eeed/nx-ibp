/**
 * بوّابة دفع المنصّة (Tap) — إعداد السوبر أدمن لتحصيل اشتراكات الوسطاء:
 *  - يخزّن مفتاحَي الاختبار والحيّ معًا (السرّي مشفّر at-rest، لا يُعاد خامًا).
 *  - `mode` يحدّد الفعّال؛ التبديل test⇄live بلا إعادة إدخال.
 *  - تحقّق البادئات (pk_test_/sk_test_/pk_live_/sk_live_) ومنع التفعيل بلا مفتاحَي الوضع.
 *  - مستخدم المستأجر ممنوع.
 * ملاحظة: نُبقي البوّابة **معطّلة** في النهاية كي لا تلتقطها فوترة الاشتراكات (تتصل بشبكة Tap حقيقية).
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

describe("بوّابة دفع المنصّة (e2e)", () => {
  let app: INestApplication;
  let platform: string;
  let tenantUser: string;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const srv = () => app.getHttpServer();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    platform = (await request(srv()).post("/platform/login").send({ email: "admin@ibp-platform.sa", password: "Passw0rd!" })).body.accessToken;
    tenantUser = (await request(srv()).post("/auth/login").send({ email: "waleed@gulf-demo.sa", password: "Passw0rd!" })).body.accessToken;
  });

  afterAll(async () => {
    // أمان: تعطيل البوّابة كي لا تتصل فوترة الاشتراكات بشبكة Tap في بقية الاختبارات
    try { await request(srv()).put("/platform/payment").set(auth(platform)).send({ enabled: false }); } catch { /* ignore */ }
    await app?.close();
  });

  it("قراءة الإعداد الافتراضي: tap · وضع الاختبار · معطّل · بلا أسرار", async () => {
    const res = await request(srv()).get("/platform/payment").set(auth(platform)).expect(200);
    expect(res.body.provider).toBe("tap");
    expect(["test", "live"]).toContain(res.body.mode);
    expect(res.body).toMatchObject({ hasTestSecret: expect.any(Boolean), hasLiveSecret: expect.any(Boolean) });
    // لا يُعاد أي مفتاح سرّي خام
    expect(JSON.stringify(res.body)).not.toContain("sk_");
  });

  it("بادئة مفتاح اختبار خاطئة ⇒ 400", () =>
    request(srv()).put("/platform/payment").set(auth(platform)).send({ testPublicKey: "pk_wrong_x" }).expect(400));

  it("بادئة مفتاح حيّ خاطئة ⇒ 400", () =>
    request(srv()).put("/platform/payment").set(auth(platform)).send({ liveSecretKey: "sk_test_notlive" }).expect(400));

  it("لا يمكن التفعيل قبل إكمال مفتاحَي الوضع الفعّال ⇒ 400", () =>
    request(srv()).put("/platform/payment").set(auth(platform)).send({ mode: "live", enabled: true }).expect(400));

  it("حفظ مفاتيح الاختبار + معرّف التاجر ثم التفعيل (وضع الاختبار) ⇒ لا يُعاد السرّي", async () => {
    const res = await request(srv()).put("/platform/payment").set(auth(platform))
      .send({ mode: "test", enabled: true, merchantId: "36666939", testPublicKey: "pk_test_e2ePUB", testSecretKey: "sk_test_e2eSECRET" })
      .expect(200);
    expect(res.body).toMatchObject({ mode: "test", enabled: true, merchantId: "36666939", testPublicKey: "pk_test_e2ePUB", hasTestSecret: true });
    expect(JSON.stringify(res.body)).not.toContain("sk_test_e2eSECRET");
  });

  it("إضافة مفاتيح الحيّ والتبديل إليه بلا إعادة إدخال مفاتيح الاختبار ⇒ كلاهما محفوظ", async () => {
    const res = await request(srv()).put("/platform/payment").set(auth(platform))
      .send({ mode: "live", enabled: true, livePublicKey: "pk_live_e2ePUB", liveSecretKey: "sk_live_e2eSECRET" })
      .expect(200);
    expect(res.body).toMatchObject({ mode: "live", enabled: true, hasTestSecret: true, hasLiveSecret: true, testPublicKey: "pk_test_e2ePUB", livePublicKey: "pk_live_e2ePUB" });
  });

  it("التبديل الرجوع لوضع الاختبار بلا إعادة إدخال ⇒ الوضع الفعّال test والمفاتيح باقية", async () => {
    const res = await request(srv()).put("/platform/payment").set(auth(platform)).send({ mode: "test" }).expect(200);
    expect(res.body).toMatchObject({ mode: "test", hasTestSecret: true, hasLiveSecret: true });
  });

  it("مستخدم المستأجر ممنوع من إعداد بوّابة المنصّة ⇒ 403", async () => {
    await request(srv()).get("/platform/payment").set(auth(tenantUser)).expect(403);
    await request(srv()).put("/platform/payment").set(auth(tenantUser)).send({ mode: "test" }).expect(403);
  });

  it("التعطيل النهائي ⇒ enabled=false (كي لا تلتقطها فوترة الاشتراكات)", async () => {
    const res = await request(srv()).put("/platform/payment").set(auth(platform)).send({ enabled: false }).expect(200);
    expect(res.body.enabled).toBe(false);
  });
});
