/**
 * اختبار فوترة الاشتراكات (B2) عبر بوّابة Sandbox (بلا شبكة):
 *  - checkout ينشئ فاتورة PENDING + رابط دفع؛ المستأجر يبقى TRIAL.
 *  - confirm (الشحنة مدفوعة) ⇒ الفاتورة PAID + الاشتراك ACTIVE + ترقية الباقة.
 *  - webhook موقّع ⇒ تفعيل بديل. عزل: لا يؤكّد مستأجر فاتورة غيره (404).
 *  - settings مطلوبة (بلا توكن ⇒ 401). باقة مجهولة ⇒ 422.
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { createHmac } from "node:crypto";
import { AppModule } from "../src/app.module";

describe("فوترة الاشتراكات (e2e)", () => {
  let app: INestApplication;
  const srv = () => app.getHttpServer();
  const uniq = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const sandboxSign = (id: string, status: string) => createHmac("sha256", process.env.BILLING_WEBHOOK_SECRET ?? "sandbox_secret").update(`${id}|${status}`).digest("hex");

  // ينشئ مستأجرًا جديدًا (TRIAL) ويعيد توكن المالك
  async function newOwner(): Promise<string> {
    const res = await request(srv()).post("/signup").send({ companyName: `فوترة ${uniq()}`, adminName: "مالك", adminEmail: `bill-${uniq()}@brk.sa`, password: "Owner1Pass" }).expect(201);
    return res.body.accessToken;
  }
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  afterAll(async () => { await app?.close(); });

  it("checkout ⇒ فاتورة PENDING + رابط دفع، والمستأجر يبقى TRIAL", async () => {
    const t = await newOwner();
    const co = await request(srv()).post("/billing/checkout").set(auth(t)).send({ planCode: "premium", cycle: "YEARLY" }).expect(201);
    expect(co.body.status).toBe("PENDING");
    expect(co.body.redirectUrl).toBeTruthy();
    expect(co.body.amount).toBe(3490); // premium السنوي لكل مستخدم (3490) × مقعد واحد
    const sub = await request(srv()).get("/billing/subscription").set(auth(t)).expect(200);
    expect(sub.body.status).toBe("TRIAL");
  });

  it("confirm (مدفوع) ⇒ الفاتورة PAID + الاشتراك ACTIVE + ترقية الباقة", async () => {
    const t = await newOwner();
    const co = await request(srv()).post("/billing/checkout").set(auth(t)).send({ planCode: "premium" }).expect(201);
    const conf = await request(srv()).post(`/billing/${co.body.invoiceId}/confirm`).set(auth(t)).expect(201);
    expect(conf.body.status).toBe("PAID");
    const sub = await request(srv()).get("/billing/subscription").set(auth(t)).expect(200);
    expect(sub.body.status).toBe("ACTIVE");
    expect(sub.body.subscription.plan.code).toBe("premium");
    expect(sub.body.subscription.renewsAt).toBeTruthy();
    const inv = await request(srv()).get("/billing/invoices").set(auth(t)).expect(200);
    expect(inv.body[0].status).toBe("PAID");
  });

  it("عزل: لا يؤكّد مستأجر فاتورة مستأجر آخر (404)", async () => {
    const a = await newOwner();
    const co = await request(srv()).post("/billing/checkout").set(auth(a)).send({ planCode: "basic" }).expect(201);
    const b = await newOwner();
    await request(srv()).post(`/billing/${co.body.invoiceId}/confirm`).set(auth(b)).expect(404);
  });

  it("webhook موقّع ⇒ تفعيل الاشتراك", async () => {
    const t = await newOwner();
    const co = await request(srv()).post("/billing/checkout").set(auth(t)).send({ planCode: "basic" }).expect(201);
    const chargeId = `sbx_${co.body.invoiceId}`;
    await request(srv()).post("/billing/webhook")
      .set("hashstring", sandboxSign(chargeId, "CAPTURED"))
      .send({ id: chargeId, status: "CAPTURED", amount: 499, currency: "SAR" })
      .expect(201);
    const sub = await request(srv()).get("/billing/subscription").set(auth(t)).expect(200);
    expect(sub.body.status).toBe("ACTIVE");
  });

  it("webhook بتوقيع خاطئ ⇒ 409", () =>
    request(srv()).post("/billing/webhook").set("hashstring", "deadbeef").send({ id: "sbx_x", status: "CAPTURED" }).expect(409));

  it("checkout بلا توكن ⇒ 401", () =>
    request(srv()).post("/billing/checkout").send({ planCode: "basic" }).expect(401));

  it("باقة مجهولة ⇒ 422", async () => {
    const t = await newOwner();
    await request(srv()).post("/billing/checkout").set(auth(t)).send({ planCode: "nope" }).expect(422);
  });

  it("GET /billing/seats ⇒ لقطة المقاعد (دفع لكل مستخدم) — تجربة بلا فرق تناسبي", async () => {
    const t = await newOwner();
    const s = (await request(srv()).get("/billing/seats").set(auth(t)).expect(200)).body as { activeUsers: number; perUser: number; periodCost: number; pendingKind: string; isTrial: boolean; addUnit: number };
    expect(s.activeUsers).toBeGreaterThanOrEqual(1); // المالك على الأقل
    expect(s.isTrial).toBe(true); // مستأجر جديد بلا فاتورة مدفوعة
    expect(s.pendingKind).toBe("none"); // لا احتساب تناسبي أثناء التجربة
    expect(typeof s.perUser).toBe("number");
    expect(s.periodCost).toBe(Math.round(s.perUser * s.activeUsers * 100) / 100);
  });

  it("بعد الدفع: /billing/seats يعكس الاشتراك المفعّل بلا فرق تناسبي (العدد = المدفوع)", async () => {
    const t = await newOwner();
    const co = await request(srv()).post("/billing/checkout").set(auth(t)).send({ planCode: "premium" }).expect(201);
    await request(srv()).post(`/billing/${co.body.invoiceId}/confirm`).set(auth(t)).expect(201);
    const s = (await request(srv()).get("/billing/seats").set(auth(t)).expect(200)).body as { paidSeats: number; activeUsers: number; delta: number; pendingKind: string; isTrial: boolean };
    expect(s.isTrial).toBe(false);
    expect(s.delta).toBe(0); // العدد الفعلي = المقاعد المغطّاة بالفاتورة
    expect(s.pendingKind).toBe("none");
  });
});
