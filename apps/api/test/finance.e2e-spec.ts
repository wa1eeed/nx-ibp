/**
 * اختبار الإصدار والاعتماد المالي (تحقّق المرحلة 4ب):
 *  - شلال: AWARDED ← إصدار ← موافقة فنية ← اعتماد مالي ⇒ ISSUED.
 *  - الاعتماد المالي يولّد قيداً مزدوجاً متوازناً + إشعار مدين + فاتورة ضريبية.
 *  - RBAC: production للإصدار/الفني، finance للاعتماد المالي.
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

const PERIOD = { startDate: "2026-01-01", endDate: "2026-12-31", currency: "SAR" };

describe("الإصدار والاعتماد المالي (e2e)", () => {
  let app: INestApplication;
  let gm: string; // مدير عام
  let underwriter: string; // مسؤول التسعير (production، لا finance)
  let accountant: string; // محاسب (finance، لا production)
  let sales: string; // مدير مبيعات (لا production)
  let amanGm: string;

  const login = async (email: string) =>
    (await request(app.getHttpServer()).post("/auth/login").send({ email, password: "Passw0rd!" })).body.accessToken as string;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function createAwardedRequest(): Promise<string> {
    const cr = String(Date.now()).slice(-9) + Math.floor(Math.random() * 90);
    const client = await request(app.getHttpServer()).post("/clients").set(auth(gm)).send({ type: "CORPORATE", name: "عميل إصدار", crNumber: cr });
    await request(app.getHttpServer()).post(`/clients/${client.body.id}/compliance`).set(auth(gm)).send({ decision: "APPROVED" });
    const req = await request(app.getHttpServer()).post("/requests").set(auth(gm)).send({
      clientId: client.body.id, productLineCode: "GMI",
      base: { insuredName: "ع", network: "standard", annualLimit: 500000, ...PERIOD },
      blocks: { members: [{ name: "أ", nationalId: "1234567890", relation: "employee", dob: "1990-01-01", gender: "male" }] },
    });
    const slip = await request(app.getHttpServer()).post("/slips").set(auth(gm)).send({ requestId: req.body.id });
    const q = await request(app.getHttpServer()).post(`/slips/${slip.body.id}/quotations`).set(auth(gm))
      .send({ insurerName: "بوبا", premium: 60000, vat: 9000, totalPremium: 69000, deductible: 500, limit: 1000000 });
    await request(app.getHttpServer()).post(`/slips/${slip.body.id}/select`).set(auth(gm)).send({ quotationId: q.body.id });
    return req.body.id;
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

  it("مدير المبيعات لا يملك صلاحية الإصدار (production) ⇒ 403", async () => {
    const requestId = await createAwardedRequest();
    await request(app.getHttpServer()).post("/policies/issue").set(auth(sales)).send({ requestId }).expect(403);
  });

  it("الشلال الكامل: إصدار ← فني ← مالي ⇒ قيد متوازن + إشعار + فاتورة", async () => {
    const requestId = await createAwardedRequest();

    // 1) الإصدار (المكتتب)
    const policy = (await request(app.getHttpServer()).post("/policies/issue").set(auth(underwriter)).send({ requestId, branchCode: "RUH" }).expect(201)).body;
    expect(policy.sequenceNo).toMatch(/^POL-RUH-MED-/);
    expect(policy.status).toBe("TECHNICAL_REVIEW");
    expect(Number(policy.commissionAmount)).toBe(7500); // 60000 × 12.5%

    // 2) المحاسب لا يستطيع الاعتماد قبل الموافقة الفنية المنطقية، لكنه ممنوع أصلاً من الإصدار/الفني (production)
    await request(app.getHttpServer()).post(`/policies/${policy.id}/approve-technical`).set(auth(accountant)).expect(403);

    // 3) الموافقة الفنية (المكتتب) ⇒ FINANCE_REVIEW
    const tech = (await request(app.getHttpServer()).post(`/policies/${policy.id}/approve-technical`).set(auth(underwriter)).expect(200)).body;
    expect(tech.status).toBe("FINANCE_REVIEW");

    // 4) المكتتب لا يملك الاعتماد المالي (finance) ⇒ 403
    await request(app.getHttpServer()).post(`/finance/policies/${policy.id}/approve`).set(auth(underwriter)).expect(403);

    // 5) الاعتماد المالي (المحاسب) ⇒ ISSUED + توليد المستندات
    const fin = (await request(app.getHttpServer()).post(`/finance/policies/${policy.id}/approve`).set(auth(accountant)).expect(200)).body;
    expect(fin.status).toBe("ISSUED");
    expect(fin.voucher).toMatch(/^JRV-/);
    expect(fin.debitNote).toMatch(/^DN-/);
    expect(fin.invoice).toMatch(/^INV-/);

    // 6) المستندات المولّدة: قيد متوازن (مدين = دائن) + فاتورة بقيمة العمولة
    const post = (await request(app.getHttpServer()).get(`/finance/policies/${policy.id}/postings`).set(auth(accountant)).expect(200)).body;
    const entries = post.voucher.lines.entries as Array<{ debit: number; credit: number }>;
    const debit = entries.reduce((s, e) => s + Number(e.debit), 0);
    const credit = entries.reduce((s, e) => s + Number(e.credit), 0);
    expect(debit).toBe(credit); // توازن القيد المزدوج
    expect(debit).toBe(69000);
    expect(Number(post.invoice.netAmount)).toBe(7500); // العمولة
    expect(Number(post.invoice.vatAmount)).toBe(1125); // ضريبة العمولة 15% (على فاتورة المؤمِّن)
    expect(Number(post.debitNote.netAmount)).toBe(60000); // القسط الصافي
    expect(Number(post.debitNote.vatAmount)).toBe(9000); // ضريبة القسط 15% (على إشعار العميل)
    // ضريبة مخرجات الوسيط على العمولة مُقيَّدة كالتزام (Output VAT Payable)
    const vatLine = entries.find((e) => Number(e.credit) === 1125);
    expect(vatLine).toBeTruthy();

    // 7) الطلب أصبح ISSUED
    const req = (await request(app.getHttpServer()).get(`/requests/${requestId}`).set(auth(gm)).expect(200)).body;
    expect(req.status).toBe("ISSUED");

    // 8) لا يمكن إعادة الاعتماد المالي ⇒ 409
    await request(app.getHttpServer()).post(`/finance/policies/${policy.id}/approve`).set(auth(accountant)).expect(409);
  });

  it("العزل: مستأجر الأمان لا يرى وثائق الخليج", async () => {
    const res = await request(app.getHttpServer()).get("/policies").set(auth(amanGm)).expect(200);
    expect(res.body.every((p: { tenantId: string }) => p.tenantId === "demo-tenant-2")).toBe(true);
  });
});
