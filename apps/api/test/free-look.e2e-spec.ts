/**
 * §6.4 — حق العدول (Free-look / Cooling-off):
 *  - عند تفعيل `freeLookDays`، الوثيقة المُصدَرة تحمل `freeLookUntil`، والإلغاء ضمنه ⇒ **استرداد كامل**.
 *  - بلا تفعيل (0، الافتراضي) ⇒ لا نافذة ⇒ الإلغاء نسبةً وتناسبًا (السلوك التاريخي).
 * تُنفَّذ في شركة عبر التسجيل الذاتي (شجرة حسابات + finance)، مع تعطيل البوّابة الفنية وفصل المهام
 * ليصدر المالك ويعتمد مباشرةً — عزل تامّ.
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

describe("§6.4 حق العدول (Free-look) (e2e)", () => {
  let app: INestApplication;
  const srv = () => app.getHttpServer();
  const uniq = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const PERIOD = { startDate: "2026-01-01", endDate: "2026-12-31", currency: "SAR" };

  const owner = async () => (await request(srv()).post("/signup").send({ companyName: `عدول ${uniq()}`, adminName: "مالك", adminEmail: `fl-${uniq()}@brk.sa`, password: "Owner1Pass" }).expect(201)).body.accessToken;

  // يصدر وثيقة مُعتمَدة (بوّابة فنية معطّلة + بلا فصل مهام ⇒ المالك يُصدر ويعتمد)
  async function issueApprovedPolicy(t: string): Promise<string> {
    const cr = String(Date.now()).slice(-8) + String(10 + Math.floor(Math.random() * 89));
    const client = (await request(srv()).post("/clients").set(auth(t)).send({ type: "CORPORATE", name: "عميل عدول", crNumber: cr })).body;
    await request(srv()).post(`/clients/${client.id}/compliance`).set(auth(t)).send({ decision: "APPROVED" });
    const req = (await request(srv()).post("/requests").set(auth(t)).send({
      clientId: client.id, productLineCode: "GMI",
      base: { insuredName: "ع", network: "standard", annualLimit: 500000, ...PERIOD },
      blocks: { members: [{ name: "أ", nationalId: "1234567890", relation: "employee", dob: "1990-01-01", gender: "male" }] },
    })).body;
    const slip = (await request(srv()).post("/slips").set(auth(t)).send({ requestId: req.id })).body;
    const q = (await request(srv()).post(`/slips/${slip.id}/quotations`).set(auth(t)).send({ insurerName: "بوبا", premium: 60000, vat: 9000, totalPremium: 69000, deductible: 500, limit: 1000000 })).body;
    await request(srv()).post(`/slips/${slip.id}/select`).set(auth(t)).send({ quotationId: q.id });
    const policy = (await request(srv()).post("/policies/issue").set(auth(t)).send({ requestId: req.id, branchCode: "RUH", issuanceType: "POLICY" }).expect(201)).body;
    await request(srv()).post(`/finance/policies/${policy.id}/approve`).set(auth(t)).expect(200);
    return policy.id;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  afterAll(async () => { await app?.close(); });

  it("الإعداد الافتراضي: مدّة حق العدول = 0 (مُعطَّل)", async () => {
    const t = await owner();
    const c = (await request(srv()).get("/config/operations").set(auth(t)).expect(200)).body;
    expect(c.freeLookDays).toBe(0);
  });

  it("ضبط المدّة + تحقّق الحدود (>90 ⇒ 400)", async () => {
    const t = await owner();
    const r = (await request(srv()).put("/config/operations").set(auth(t)).send({ freeLookDays: 21 }).expect(200)).body;
    expect(r.freeLookDays).toBe(21);
    expect((await request(srv()).get("/config/operations").set(auth(t)).expect(200)).body.freeLookDays).toBe(21);
    await request(srv()).put("/config/operations").set(auth(t)).send({ freeLookDays: 120 }).expect(400);
  });

  it("مُفعَّل: الوثيقة تحمل نافذة عدول، والإلغاء ضمنها ⇒ استرداد كامل", async () => {
    const t = await owner();
    // تعطيل البوّابة الفنية وفصل المهام ليُصدر المالك ويعتمد مباشرةً
    await request(srv()).put("/config/approval-chain").set(auth(t)).send({ technicalGate: false, segregationOfDuties: false, steps: [] }).expect(200);
    await request(srv()).put("/config/operations").set(auth(t)).send({ freeLookDays: 21 }).expect(200);
    const policyId = await issueApprovedPolicy(t);
    // الوثيقة تحمل نافذة حق العدول (مستقبلية)
    const list = (await request(srv()).get("/policies").set(auth(t)).expect(200)).body as Array<{ id: string; freeLookUntil: string | null }>;
    const p = list.find((x) => x.id === policyId)!;
    expect(p.freeLookUntil).not.toBeNull();
    expect(new Date(p.freeLookUntil!).getTime()).toBeGreaterThan(Date.now());
    // الإلغاء الآن ضمن النافذة ⇒ استرداد كامل (القسط الصافي كاملاً 60000)
    const c = (await request(srv()).post(`/finance/policies/${policyId}/cancel`).set(auth(t)).send({ effectiveDate: "2026-07-01", reason: "عدول العميل" }).expect(200)).body;
    expect(c.freeLook).toBe(true);
    expect(c.returnNet).toBe(60000); // كامل القسط رغم مرور جزء من المدة
    expect(c.returnVat).toBe(9000);
  });

  it("مُعطَّل (0): لا نافذة ⇒ الإلغاء نسبةً وتناسبًا (توافق رجعي)", async () => {
    const t = await owner();
    await request(srv()).put("/config/approval-chain").set(auth(t)).send({ technicalGate: false, segregationOfDuties: false, steps: [] }).expect(200);
    // freeLookDays يبقى 0 (الافتراضي)
    const policyId = await issueApprovedPolicy(t);
    const list = (await request(srv()).get("/policies").set(auth(t)).expect(200)).body as Array<{ id: string; freeLookUntil: string | null }>;
    expect(list.find((x) => x.id === policyId)!.freeLookUntil).toBeNull();
    const c = (await request(srv()).post(`/finance/policies/${policyId}/cancel`).set(auth(t)).send({ effectiveDate: "2026-07-01", reason: "إلغاء عادي" }).expect(200)).body;
    expect(c.freeLook).toBe(false);
    expect(c.returnNet).toBeLessThan(60000); // نسبة وتناسب (جزء من القسط)
  });
});
