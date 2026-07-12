/**
 * اختبار E1 — الضريبة حسب فرع التأمين (تحقّق):
 *  - وثيقة **تأمين حياة (فرع TRM/فئة LIF)** ⇒ قسطها **معفى** من ضريبة القيمة المضافة (0%)
 *    حتى لو أُدخل عرضٌ بضريبة خاطئة — النظام يفرض الإعفاء (فئة ZATCA "E").
 *  - إشعار المدين (مستند ZATCA للعميل) بضريبة = 0؛ وفاتورة عمولة الوساطة تبقى خاضعة 15%.
 *  - ضبط: وثيقة **طبي (GMI)** تبقى خاضعة 15% (لا تراجع).
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

const PERIOD = { startDate: "2026-01-01", endDate: "2026-12-31", currency: "SAR" };

describe("الضريبة حسب فرع التأمين — E1 (e2e)", () => {
  let app: INestApplication;
  let gm: string; // مدير عام
  let underwriter: string; // مسؤول التسعير (production)
  let accountant: string; // محاسب (finance)

  const login = async (email: string) =>
    (await request(app.getHttpServer()).post("/auth/login").send({ email, password: "Passw0rd!" })).body.accessToken as string;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  /** ينشئ طلبًا مُسندًا (AWARDED) لفرعٍ مُعطى، مع عرضٍ بضريبة مُدخَلة (لاختبار فرض الإعفاء). */
  async function awardedRequest(productLineCode: string, base: Record<string, unknown>, blocks: Record<string, unknown>): Promise<string> {
    const cr = String(Date.now()).slice(-8) + String(10 + Math.floor(Math.random() * 89));
    const client = await request(app.getHttpServer()).post("/clients").set(auth(gm)).send({ type: "CORPORATE", name: "عميل ضريبة", crNumber: cr });
    await request(app.getHttpServer()).post(`/clients/${client.body.id}/compliance`).set(auth(gm)).send({ decision: "APPROVED" });
    const req = await request(app.getHttpServer()).post("/requests").set(auth(gm)).send({
      clientId: client.body.id, productLineCode,
      base: { insuredName: "مؤمَّن", ...PERIOD, ...base },
      blocks,
    });
    const slip = await request(app.getHttpServer()).post("/slips").set(auth(gm)).send({ requestId: req.body.id });
    // عرضٌ بضريبة 15,000 (خاطئة لفرع الحياة) — يجب أن يفرض النظام الإعفاء ويجعلها 0
    const q = await request(app.getHttpServer()).post(`/slips/${slip.body.id}/quotations`).set(auth(gm))
      .send({ insurerName: "شركة تأمين", premium: 100000, vat: 15000, totalPremium: 115000, deductible: 0, limit: 1000000 });
    await request(app.getHttpServer()).post(`/slips/${slip.body.id}/select`).set(auth(gm)).send({ quotationId: q.body.id });
    return req.body.id;
  }

  async function issueToIssued(requestId: string) {
    const policy = (await request(app.getHttpServer()).post("/policies/issue").set(auth(underwriter))
      .send({ requestId, branchCode: "RUH", issuanceType: "POLICY" }).expect(201)).body;
    await request(app.getHttpServer()).post(`/policies/${policy.id}/approve-technical`).set(auth(underwriter)).expect(200);
    const fin = (await request(app.getHttpServer()).post(`/finance/policies/${policy.id}/approve`).set(auth(accountant)).expect(200)).body;
    return { policy, fin };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    gm = await login("waleed@gulf-demo.sa");
    underwriter = await login("majed@gulf-demo.sa");
    accountant = await login("laila@gulf-demo.sa");
  });

  afterAll(async () => {
    await app?.close();
  });

  it("تأمين الحياة (TRM) ⇒ القسط معفى: الوثيقة بضريبة 0 رغم إدخال 15,000 في العرض", async () => {
    const requestId = await awardedRequest("TRM", { termYears: 10, premiumFrequency: "annual" }, {
      lives: [{ name: "مؤمَّن حياة", nationalId: "1098765432", dob: "1985-05-05", gender: "male", sumAssured: 500000 }],
    });
    const policy = (await request(app.getHttpServer()).post("/policies/issue").set(auth(underwriter))
      .send({ requestId, branchCode: "RUH", issuanceType: "POLICY" }).expect(201)).body;
    expect(policy.sequenceNo).toMatch(/^POL-RUH-LIF-/);
    expect(Number(policy.vat)).toBe(0); // الإعفاء مفروض
    expect(Number(policy.totalPremium)).toBe(100000); // القسط فقط بلا ضريبة
  });

  it("الشلال الكامل لوثيقة حياة ⇒ إشعار مدين بضريبة 0 (فئة معفاة) + فاتورة عمولة خاضعة 15%", async () => {
    const requestId = await awardedRequest("TRM", { termYears: 5, premiumFrequency: "annual" }, {
      lives: [{ name: "مؤمَّن حياة", nationalId: "1076543210", dob: "1980-03-03", gender: "female", sumAssured: 300000 }],
    });
    const { policy, fin } = await issueToIssued(requestId);
    expect(fin.status).toBe("ISSUED");

    const list = (await request(app.getHttpServer()).get("/zatca/billing-documents").set(auth(gm)).expect(200)).body as Array<Record<string, unknown>>;
    const docs = list.filter((d) => d.policyId === policy.id);
    const debit = docs.find((d) => d.documentType === "DEBIT_NOTE");
    const invoice = docs.find((d) => d.documentType === "TAX_INVOICE");
    expect(debit).toBeTruthy();
    expect(Number(debit!.totalVat)).toBe(0); // قسط الحياة معفى
    expect(invoice).toBeTruthy();
    expect(Number(invoice!.totalVat)).toBeGreaterThan(0); // عمولة الوساطة خاضعة 15%
  });

  it("ضبط: تأمين طبي (GMI) يبقى خاضعًا 15% (لا تراجع)", async () => {
    const requestId = await awardedRequest("GMI", { network: "standard", annualLimit: 500000 }, {
      members: [{ name: "أ", nationalId: "1234567890", relation: "employee", dob: "1990-01-01", gender: "male" }],
    });
    const policy = (await request(app.getHttpServer()).post("/policies/issue").set(auth(underwriter))
      .send({ requestId, branchCode: "RUH", issuanceType: "POLICY" }).expect(201)).body;
    expect(policy.sequenceNo).toMatch(/^POL-RUH-MED-/);
    expect(Number(policy.vat)).toBe(15000); // 100000 × 15%
    expect(Number(policy.totalPremium)).toBe(115000);
  });
});
