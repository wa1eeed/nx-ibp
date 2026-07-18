/**
 * §9.4 — تعدّد العملات (Multi-currency):
 *  - وثيقة بالريال (fxRate=1) ⇒ الدفاتر كما هي (توافق رجعي).
 *  - وثيقة أجنبية (USD + سعر صرف) ⇒ **الدفاتر بالريال** (العملة الوظيفية): كل المبالغ المرحَّلة =
 *    مبلغ الوثيقة × سعر الصرف (إشعار المدين/القيد بالريال)؛ والوثيقة تحتفظ بعملتها للعرض.
 *  - عملة أجنبية بلا سعر صرف ⇒ يُرفض الإصدار (409).
 * تُنفَّذ في شركة عبر التسجيل الذاتي (بوّابة فنية + فصل مهام معطّلان ليُصدر المالك ويعتمد).
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

describe("§9.4 تعدّد العملات (e2e)", () => {
  let app: INestApplication;
  const srv = () => app.getHttpServer();
  const uniq = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const PERIOD = { startDate: "2026-01-01", endDate: "2026-12-31", currency: "SAR" };
  const owner = async () => (await request(srv()).post("/signup").send({ companyName: `عملات ${uniq()}`, adminName: "مالك", adminEmail: `mc-${uniq()}@brk.sa`, password: "Owner1Pass" }).expect(201)).body.accessToken;

  // يُنشئ طلبًا مُسنَدًا (عرض 60000 قسط · 9000 ض · إجمالي 69000) ويعيد requestId + clientId
  async function awardedRequest(t: string): Promise<{ requestId: string; clientId: string }> {
    const cr = String(Date.now()).slice(-8) + String(10 + Math.floor(Math.random() * 89));
    const client = (await request(srv()).post("/clients").set(auth(t)).send({ type: "CORPORATE", name: "عميل عملة", crNumber: cr })).body;
    await request(srv()).post(`/clients/${client.id}/compliance`).set(auth(t)).send({ decision: "APPROVED" });
    const req = (await request(srv()).post("/requests").set(auth(t)).send({
      clientId: client.id, productLineCode: "GMI",
      base: { insuredName: "ع", network: "standard", annualLimit: 500000, ...PERIOD },
      blocks: { members: [{ name: "أ", nationalId: "1234567890", relation: "employee", dob: "1990-01-01", gender: "male" }] },
    })).body;
    const slip = (await request(srv()).post("/slips").set(auth(t)).send({ requestId: req.id })).body;
    const q = (await request(srv()).post(`/slips/${slip.id}/quotations`).set(auth(t)).send({ insurerName: "بوبا", premium: 60000, vat: 9000, totalPremium: 69000, deductible: 500, limit: 1000000 })).body;
    await request(srv()).post(`/slips/${slip.id}/select`).set(auth(t)).send({ quotationId: q.id });
    return { requestId: req.id, clientId: client.id };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  afterAll(async () => { await app?.close(); });

  const setup = async (t: string) => request(srv()).put("/config/approval-chain").set(auth(t)).send({ technicalGate: false, segregationOfDuties: false, steps: [] }).expect(200);

  it("وثيقة بالريال (الافتراضي): إشعار مدين العميل = 69000 (بلا تحويل)", async () => {
    const t = await owner();
    await setup(t);
    const { requestId, clientId } = await awardedRequest(t);
    const policy = (await request(srv()).post("/policies/issue").set(auth(t)).send({ requestId, branchCode: "RUH", issuanceType: "POLICY" }).expect(201)).body;
    expect(policy.currency).toBe("SAR");
    await request(srv()).post(`/finance/policies/${policy.id}/approve`).set(auth(t)).expect(200);
    const st = (await request(srv()).get(`/finance/statement/${clientId}`).set(auth(t)).expect(200)).body;
    expect(st.summary.charged).toBe(69000);
  });

  it("وثيقة بالدولار (سعر 3.75): الدفاتر بالريال — إشعار مدين = 69000×3.75 = 258750", async () => {
    const t = await owner();
    await setup(t);
    const { requestId, clientId } = await awardedRequest(t);
    const policy = (await request(srv()).post("/policies/issue").set(auth(t)).send({ requestId, branchCode: "RUH", issuanceType: "POLICY", currency: "USD", fxRate: 3.75 }).expect(201)).body;
    expect(policy.currency).toBe("USD");
    expect(Number(policy.fxRate)).toBe(3.75);
    await request(srv()).post(`/finance/policies/${policy.id}/approve`).set(auth(t)).expect(200);
    const st = (await request(srv()).get(`/finance/statement/${clientId}`).set(auth(t)).expect(200)).body;
    expect(st.summary.charged).toBe(258750); // 69000 × 3.75 (العملة الوظيفية = الريال)
    // القائمة تُظهر عملة الوثيقة
    const list = (await request(srv()).get("/policies").set(auth(t)).expect(200)).body as Array<{ id: string; currency: string }>;
    expect(list.find((p) => p.id === policy.id)!.currency).toBe("USD");
  });

  it("عملة أجنبية بلا سعر صرف ⇒ يُرفض الإصدار (409)", async () => {
    const t = await owner();
    await setup(t);
    const { requestId } = await awardedRequest(t);
    await request(srv()).post("/policies/issue").set(auth(t)).send({ requestId, branchCode: "RUH", issuanceType: "POLICY", currency: "USD" }).expect(409);
  });
});
