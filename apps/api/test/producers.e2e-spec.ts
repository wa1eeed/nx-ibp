/**
 * اختبار سجلّ المنتِجين (الوسطاء الفرعيون) — بند 6:
 *  - RBAC: السجلّ والتسوية تحت وحدة المالية (شأن عمولات/مدفوعات).
 *  - ربط وثيقة بمنتِج ⇒ حصّة عمولته تُحتسب آليًا بنسبته.
 *  - الدفتر: العمولة المستحقّة = Σ حصص وثائقه المُصدَرة؛ التسوية (PYV) تُنقص المتبقّي وتمنع التجاوز.
 *  - العزل بين المستأجرين.
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

const PERIOD = { startDate: "2026-01-01", endDate: "2026-12-31", currency: "SAR" };

describe("سجلّ المنتِجين (e2e)", () => {
  let app: INestApplication;
  let gm: string; // مدير عام
  let underwriter: string; // production (لا finance)
  let accountant: string; // finance
  let sales: string; // لا production
  let amanGm: string;

  const login = async (email: string) =>
    (await request(app.getHttpServer()).post("/auth/login").send({ email, password: "Passw0rd!" })).body.accessToken as string;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function issueLinkedPolicy(producerId: string): Promise<{ policyId: string }> {
    const srv = app.getHttpServer();
    const cr = String(Date.now()).slice(-9) + Math.floor(Math.random() * 90);
    const client = await request(srv).post("/clients").set(auth(gm)).send({ type: "CORPORATE", name: "عميل منتِج", crNumber: cr });
    await request(srv).post(`/clients/${client.body.id}/compliance`).set(auth(gm)).send({ decision: "APPROVED" });
    const req = await request(srv).post("/requests").set(auth(gm)).send({
      clientId: client.body.id, productLineCode: "GMI",
      base: { insuredName: "ع", network: "standard", annualLimit: 500000, ...PERIOD },
      blocks: { members: [{ name: "أ", nationalId: "1234567890", relation: "employee", dob: "1990-01-01", gender: "male" }] },
    });
    const slip = await request(srv).post("/slips").set(auth(underwriter)).send({ requestId: req.body.id });
    const q = await request(srv).post(`/slips/${slip.body.id}/quotations`).set(auth(underwriter))
      .send({ insurerName: "بوبا", premium: 60000, vat: 9000, totalPremium: 69000, deductible: 500, limit: 1000000 });
    await request(srv).post(`/slips/${slip.body.id}/select`).set(auth(underwriter)).send({ quotationId: q.body.id });
    // إصدار مع ربط المنتِج (بلا حصّة يدوية ⇒ تُحتسب بنسبته)
    const policy = await request(srv).post("/policies/issue").set(auth(underwriter)).send({ requestId: req.body.id, branchCode: "RUH", producerId });
    await request(srv).post(`/policies/${policy.body.id}/approve-technical`).set(auth(underwriter)).expect(200);
    await request(srv).post(`/finance/policies/${policy.body.id}/approve`).set(auth(accountant)).expect(200);
    return { policyId: policy.body.id };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    gm = await login("waleed@gulf-demo.sa");
    underwriter = await login("majed@gulf-demo.sa");
    accountant = await login("laila@gulf-demo.sa");
    sales = await login("sara@gulf-demo.sa");
    amanGm = await login("omar@aman-demo.sa");
  });

  afterAll(async () => {
    await app?.close();
  });

  it("غير المالية (المبيعات/المكتتب) ممنوع من إنشاء منتِج ⇒ 403", async () => {
    await request(app.getHttpServer()).post("/producers").set(auth(sales)).send({ name: "منتِج" }).expect(403);
    await request(app.getHttpServer()).post("/producers").set(auth(underwriter)).send({ name: "منتِج" }).expect(403);
  });

  it("إنشاء منتِج (المحاسب) ⇒ 201 برمز PRD-، ويظهر في السجلّ", async () => {
    const p = (await request(app.getHttpServer()).post("/producers").set(auth(accountant)).send({ name: "مكتب النخبة", type: "COMPANY", licenseNo: "IA-PRD-2026-1", commissionRate: 20 }).expect(201)).body;
    expect(p.code).toMatch(/^PRD-/);
    expect(p.name).toBe("مكتب النخبة");
    const list = (await request(app.getHttpServer()).get("/producers").set(auth(accountant)).expect(200)).body;
    expect(list.rows.some((r: { id: string }) => r.id === p.id)).toBe(true);
    expect(typeof list.summary.outstanding).toBe("number");
  });

  it("ربط وثيقة بمنتِج ⇒ حصّة عمولته 20% تُحتسب آليًا، وتظهر في دفتره", async () => {
    const producer = (await request(app.getHttpServer()).post("/producers").set(auth(accountant)).send({ name: "خالد المنتِج", commissionRate: 20 }).expect(201)).body;
    await issueLinkedPolicy(producer.id);
    const detail = (await request(app.getHttpServer()).get(`/producers/${producer.id}`).set(auth(accountant)).expect(200)).body;
    // العمولة 60000×12.5% = 7500؛ حصّة المنتِج 20% = 1500
    expect(detail.ledger.commissionOwed).toBeCloseTo(1500, 2);
    expect(detail.ledger.outstanding).toBeCloseTo(1500, 2);
    expect(detail.policies.length).toBeGreaterThanOrEqual(1);
    expect(Number(detail.policies[0].producerCommission)).toBeCloseTo(1500, 2);
  });

  it("تسوية المنتِج (PYV) تُنقص المتبقّي · التجاوز 409 · المكتتب (لا finance) 403", async () => {
    const srv = app.getHttpServer();
    const producer = (await request(srv).post("/producers").set(auth(accountant)).send({ name: "منتِج للتسوية", commissionRate: 20 }).expect(201)).body;
    await issueLinkedPolicy(producer.id); // مستحقّ 1500

    // المكتتب لا يملك صلاحية المالية ⇒ 403
    await request(srv).post(`/producers/${producer.id}/settle`).set(auth(underwriter)).send({ amount: 100 }).expect(403);

    // تسوية جزئية ⇒ PYV + إنقاص المتبقّي
    const s1 = (await request(srv).post(`/producers/${producer.id}/settle`).set(auth(accountant)).send({ amount: 1000, reference: "TRF-1" }).expect(201)).body;
    expect(s1.voucher.sequenceNo).toMatch(/^PYV-/);
    expect(s1.outstanding).toBeCloseTo(500, 2);

    // التجاوز عن المتبقّي ⇒ 409
    await request(srv).post(`/producers/${producer.id}/settle`).set(auth(accountant)).send({ amount: 9999 }).expect(409);

    // الدفتر يعكس المُسوّى
    const detail = (await request(srv).get(`/producers/${producer.id}`).set(auth(accountant)).expect(200)).body;
    expect(detail.ledger.paid).toBeCloseTo(1000, 2);
    expect(detail.ledger.outstanding).toBeCloseTo(500, 2);
    expect(detail.settlements.length).toBeGreaterThanOrEqual(1);
  });

  it("بوّابة الباقة + العزل: مستأجر الأمان (basic بلا ميزة المنتِجين) ممنوع ⇒ 403", async () => {
    const gulf = (await request(app.getHttpServer()).post("/producers").set(auth(accountant)).send({ name: "منتِج خليجي معزول" }).expect(201)).body;
    // الأمان على باقة أساسية لا تشمل feature.producers ⇒ لا وصول للسجلّ إطلاقًا (يمنع رؤية منتِجي الخليج)
    await request(app.getHttpServer()).get("/producers").set(auth(amanGm)).expect(403);
    await request(app.getHttpServer()).get(`/producers/${gulf.id}`).set(auth(amanGm)).expect(403);
  });
});
