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

    // 1) الإصدار (المكتتب) — مع الحقول المعيارية للوثيقة
    const policy = (await request(app.getHttpServer()).post("/policies/issue").set(auth(underwriter))
      .send({ requestId, branchCode: "RUH", insurerPolicyNo: "POL-INS-2026-99", issuanceType: "POLICY", sumInsured: 500000, policyFees: 250, paymentTerms: "دفعة واحدة خلال 7 أيام", producerName: "وسيط فرعي", producerCommission: 500 })
      .expect(201)).body;
    expect(policy.sequenceNo).toMatch(/^POL-RUH-MED-/);
    expect(policy.status).toBe("TECHNICAL_REVIEW");
    expect(Number(policy.commissionAmount)).toBe(7500); // 60000 × 12.5%
    // الحقول المعيارية محفوظة
    expect(policy.insurerPolicyNo).toBe("POL-INS-2026-99");
    expect(Number(policy.sumInsured)).toBe(500000);
    expect(policy.issuanceType).toBe("POLICY");
    expect(policy.issueDate).toBeTruthy();
    expect(policy.paymentTerms).toBe("دفعة واحدة خلال 7 أيام");

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
    expect(fin.feesInvoice).toMatch(/^INV-/); // فاتورة ضريبية للعميل برسوم الخدمة (250)
    expect(fin.serviceFees).toBe(250);

    // 6) المستندات المولّدة: قيد متوازن (مدين = دائن) + توجيه صحيح للفواتير
    // القسط 60000 + ضريبته 9000 + رسوم الخدمة 250 + ضريبتها 37.5 = مدين ذمم 69287.5
    const post = (await request(app.getHttpServer()).get(`/finance/policies/${policy.id}/postings`).set(auth(accountant)).expect(200)).body;
    const entries = post.voucher.lines.entries as Array<{ account: string; debit: number; credit: number }>;
    const debit = entries.reduce((s, e) => s + Number(e.debit), 0);
    const credit = entries.reduce((s, e) => s + Number(e.credit), 0);
    expect(debit).toBeCloseTo(credit, 2); // توازن القيد المزدوج
    expect(debit).toBeCloseTo(69287.5, 2);
    // فاتورة العمولة ⇒ على المؤمِّن
    expect(Number(post.invoice.netAmount)).toBe(7500); // العمولة
    expect(Number(post.invoice.vatAmount)).toBe(1125); // ضريبة العمولة 15% (على فاتورة المؤمِّن)
    // فاتورتان على الوثيقة: عمولة (على المؤمِّن) + رسوم خدمة (على العميل)
    const feesInv = (post.invoices as Array<{ kind: string; netAmount: string; vatAmount: string; clientId: string }>).find((i) => i.kind === "FEES");
    expect(feesInv).toBeTruthy();
    expect(Number(feesInv!.netAmount)).toBe(250); // رسوم الخدمة (إيراد الوسيط)
    expect(Number(feesInv!.vatAmount)).toBe(37.5); // ضريبة الرسوم 15%
    expect(feesInv!.clientId).toBe(policy.clientId); // موجّهة للعميل
    // إشعار العميل يجمع القسط + الرسوم (مطالبة واحدة)
    expect(Number(post.debitNote.netAmount)).toBe(60250); // القسط 60000 + الرسوم 250
    expect(Number(post.debitNote.vatAmount)).toBe(9037.5); // ضريبة القسط 9000 + ضريبة الرسوم 37.5
    // إيراد الرسوم مُقيَّد في حساب مستقل (04020) وضريبة المخرجات تجمع العمولة + الرسوم
    expect(entries.find((e) => e.account.startsWith("0402"))?.credit).toBe(250);
    const vatLine = entries.find((e) => e.account.startsWith("0203"));
    expect(Number(vatLine?.credit)).toBeCloseTo(1162.5, 2); // 1125 (عمولة) + 37.5 (رسوم)

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

  it("دورة التحصيل: سند قبض يُنقص المتبقّي · الزيادة 409 · الإكمال ⇒ مسدَّد · كشف الحساب يوازن", async () => {
    const srv = app.getHttpServer();
    const requestId = await createAwardedRequest();
    const policy = (await request(srv).post("/policies/issue").set(auth(underwriter)).send({ requestId, branchCode: "RUH" }).expect(201)).body;
    await request(srv).post(`/policies/${policy.id}/approve-technical`).set(auth(underwriter)).expect(200);
    const fin = (await request(srv).post(`/finance/policies/${policy.id}/approve`).set(auth(accountant)).expect(200)).body;

    const recv = (await request(srv).get("/finance/receivables").set(auth(accountant))).body;
    const note = recv.notes.find((n: { sequenceNo: string }) => n.sequenceNo === fin.debitNote);
    expect(note).toBeTruthy();
    expect(note.status).toBe("outstanding");
    const total = note.total as number; // 69000

    // سند قبض جزئي ⇒ partial + إنقاص المتبقّي
    const r1 = (await request(srv).post(`/finance/debit-notes/${note.id}/receipt`).set(auth(accountant)).send({ amount: 20000, method: "transfer" }).expect(201)).body;
    expect(r1.voucher.sequenceNo).toMatch(/^RCV-/);
    expect(r1.debitNote.status).toBe("partial");
    expect(r1.debitNote.outstanding).toBe(total - 20000);

    // الزيادة عن المتبقّي ⇒ 409
    await request(srv).post(`/finance/debit-notes/${note.id}/receipt`).set(auth(accountant)).send({ amount: total }).expect(409);

    // إكمال التحصيل ⇒ paid
    const r2 = (await request(srv).post(`/finance/debit-notes/${note.id}/receipt`).set(auth(accountant)).send({ amount: total - 20000 }).expect(201)).body;
    expect(r2.debitNote.status).toBe("paid");

    // كشف حساب العميل يوازن (الرصيد = 0)
    const st = (await request(srv).get(`/finance/statement/${policy.clientId}`).set(auth(accountant)).expect(200)).body;
    expect(st.summary.balance).toBe(0);
    expect(st.rows.some((r: { kind: string }) => r.kind === "payment")).toBe(true);
  });

  it("صلاحية/عزل التحصيل: المكتتب (لا finance) 403 · مستأجر آخر 404", async () => {
    const srv = app.getHttpServer();
    const requestId = await createAwardedRequest();
    const policy = (await request(srv).post("/policies/issue").set(auth(underwriter)).send({ requestId, branchCode: "RUH" }).expect(201)).body;
    await request(srv).post(`/policies/${policy.id}/approve-technical`).set(auth(underwriter)).expect(200);
    const fin = (await request(srv).post(`/finance/policies/${policy.id}/approve`).set(auth(accountant)).expect(200)).body;
    const note = (await request(srv).get("/finance/receivables").set(auth(accountant))).body.notes.find((n: { sequenceNo: string }) => n.sequenceNo === fin.debitNote);
    await request(srv).post(`/finance/debit-notes/${note.id}/receipt`).set(auth(underwriter)).send({ amount: 100 }).expect(403);
    await request(srv).post(`/finance/debit-notes/${note.id}/receipt`).set(auth(amanGm)).send({ amount: 100 }).expect(404);
  });

  it("إلغاء وثيقة: قسط مُرتجَع نسبةً وتناسبًا + إشعار دائن (CNP) + CANCELLED + كشف حساب يعكسه", async () => {
    const srv = app.getHttpServer();
    const requestId = await createAwardedRequest();
    const policy = (await request(srv).post("/policies/issue").set(auth(underwriter)).send({ requestId, branchCode: "RUH" }).expect(201)).body;
    await request(srv).post(`/policies/${policy.id}/approve-technical`).set(auth(underwriter)).expect(200);
    await request(srv).post(`/finance/policies/${policy.id}/approve`).set(auth(accountant)).expect(200);

    // المكتتب (لا finance) لا يُلغي ⇒ 403
    await request(srv).post(`/finance/policies/${policy.id}/cancel`).set(auth(underwriter)).send({}).expect(403);

    // إلغاء منتصف المدة (السريان 2026-01-01..2026-12-31، الإلغاء 2026-07-01 ⇒ ~نصف القسط)
    const c = (await request(srv).post(`/finance/policies/${policy.id}/cancel`).set(auth(accountant)).send({ effectiveDate: "2026-07-01", reason: "طلب العميل" }).expect(200)).body;
    expect(c.status).toBe("CANCELLED");
    expect(c.creditNote).toMatch(/^CN-/); // إشعار دائن على العميل (قسط مُرتجَع)
    expect(c.creditNoteInsurer).toMatch(/^CNC-/); // إشعار دائن على المؤمِّن (عكس العمولة)
    expect(c.returnNet).toBeGreaterThan(25000); // ~نصف 60000
    expect(c.returnNet).toBeLessThan(35000);
    expect(c.returnCommission).toBeGreaterThan(0); // العمولة تُعكَس نسبةً وتناسبًا
    expect(c.returnCommVat).toBeCloseTo(c.returnCommission * 0.15, 2);

    // الوثيقة CANCELLED + إعادة الإلغاء ⇒ 409
    expect((await request(srv).get(`/policies/${policy.id}`).set(auth(gm)).expect(200)).body.status).toBe("CANCELLED");
    await request(srv).post(`/finance/policies/${policy.id}/cancel`).set(auth(accountant)).send({}).expect(409);

    // الإشعار الدائن يظهر في نظرة الوثيقة + كشف الحساب يعكسه (credited > 0)
    const ov = (await request(srv).get(`/policies/${policy.id}/overview`).set(auth(gm)).expect(200)).body;
    expect(ov.creditNotes.length).toBeGreaterThanOrEqual(1);
    const st = (await request(srv).get(`/finance/statement/${policy.clientId}`).set(auth(accountant)).expect(200)).body;
    expect(st.summary.credited).toBeGreaterThan(0);
  });

  it("المستحقّ للمؤمِّنين + تسوية (PYV) + ميزان مراجعة متوازن", async () => {
    const srv = app.getHttpServer();
    const requestId = await createAwardedRequest();
    const policy = (await request(srv).post("/policies/issue").set(auth(underwriter)).send({ requestId, branchCode: "RUH" }).expect(201)).body;
    await request(srv).post(`/policies/${policy.id}/approve-technical`).set(auth(underwriter)).expect(200);
    await request(srv).post(`/finance/policies/${policy.id}/approve`).set(auth(accountant)).expect(200);

    const pay = (await request(srv).get("/finance/payables").set(auth(accountant)).expect(200)).body;
    const bupa = pay.rows.find((r: { insurer: string }) => r.insurer === "بوبا");
    expect(bupa).toBeTruthy();
    expect(bupa.outstanding).toBeGreaterThan(0);

    // تسوية جزئية ⇒ سند صرف PYV
    const s1 = (await request(srv).post("/finance/insurers/settle").set(auth(accountant)).send({ insurerName: "بوبا", amount: 1000 }).expect(201)).body;
    expect(s1.voucher.sequenceNo).toMatch(/^PYV-/);
    expect(s1.outstanding).toBe(Number((bupa.outstanding - 1000).toFixed(2)));

    // تجاوز المستحقّ ⇒ 409 · المكتتب (لا finance) ⇒ 403
    await request(srv).post("/finance/insurers/settle").set(auth(accountant)).send({ insurerName: "بوبا", amount: 99_999_999 }).expect(409);
    await request(srv).post("/finance/insurers/settle").set(auth(underwriter)).send({ insurerName: "بوبا", amount: 100 }).expect(403);

    // ميزان المراجعة متوازن (مدين = دائن)
    const tb = (await request(srv).get("/finance/trial-balance").set(auth(accountant)).expect(200)).body;
    expect(tb.totals.balanced).toBe(true);
    expect(tb.totals.debit).toBe(tb.totals.credit);
  });
});
