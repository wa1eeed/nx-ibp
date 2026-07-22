/**
 * إعدادات بوّابة الدفع (Tap) — الوضع اختبار/حيّ:
 *  - مفاتيح test صحيحة ⇒ mode="test"؛ مفاتيح live ⇒ mode="live" (مُشتقّ من بادئة المفتاح).
 *  - منع خلط الأوضاع (pk_test + sk_live) ⇒ 400؛ صيغة مفتاح خاطئة ⇒ 400.
 *  - لا تفعيل بلا مفتاح سرّي.
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

describe("إعدادات الدفع Tap — اختبار/حيّ (e2e)", () => {
  let app: INestApplication;
  const srv = () => app.getHttpServer();
  const uniq = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const owner = async () => (await request(srv()).post("/signup").send({ companyName: `دفع ${uniq()}`, adminName: "مالك", adminEmail: `pay-${uniq()}@brk.sa`, password: "Owner1Pass", seatCount: 25 }).expect(201)).body.accessToken;

  beforeAll(async () => {
    const m = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = m.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  afterAll(async () => { await app?.close(); });

  it("مفاتيح اختبار صحيحة ⇒ الوضع test + مُفعّل", async () => {
    const t = await owner();
    await request(srv()).put("/config/payment").set(auth(t)).send({ provider: "tap", publicKey: "pk_test_abc123", secretKey: "sk_test_abc123", enabled: true }).expect(200);
    const s = (await request(srv()).get("/config/payment").set(auth(t)).expect(200)).body;
    expect(s.mode).toBe("test");
    expect(s.provider).toBe("tap");
    expect(s.enabled).toBe(true);
    expect(s.secretKeyMasked).not.toContain("sk_test_abc123"); // لا يُعاد خامًا
  });

  it("مفاتيح حيّة ⇒ الوضع live", async () => {
    const t = await owner();
    await request(srv()).put("/config/payment").set(auth(t)).send({ provider: "tap", publicKey: "pk_live_xyz789", secretKey: "sk_live_xyz789", enabled: true }).expect(200);
    expect((await request(srv()).get("/config/payment").set(auth(t)).expect(200)).body.mode).toBe("live");
  });

  it("خلط الأوضاع (عام اختبار + سرّي حيّ) ⇒ 400", async () => {
    const t = await owner();
    await request(srv()).put("/config/payment").set(auth(t)).send({ provider: "tap", publicKey: "pk_test_a", secretKey: "sk_live_b" }).expect(400);
  });

  it("صيغة مفتاح عام خاطئة ⇒ 400", async () => {
    const t = await owner();
    await request(srv()).put("/config/payment").set(auth(t)).send({ provider: "tap", publicKey: "wrongkey", secretKey: "sk_test_a" }).expect(400);
  });

  it("لا تفعيل بلا مفتاح سرّي ⇒ 400", async () => {
    const t = await owner();
    await request(srv()).put("/config/payment").set(auth(t)).send({ provider: "tap", publicKey: "pk_test_a", enabled: true }).expect(400);
  });
});
