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

  async function createAwardedRequest(collectionModel = "collect_full"): Promise<string> {
    const cr = String(Date.now()).slice(-8) + String(10 + Math.floor(Math.random() * 89));
    const client = await request(app.getHttpServer()).post("/clients").set(auth(gm)).send({ type: "CORPORATE", name: "عميل إصدار", crNumber: cr, collectionModel });
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

  it("#32 نموذج الدفع المباشر: ذمّة عمولة على المؤمِّن + لا أمانة + إشعار مدين بالرسوم فقط + قيد متوازن + لا يزيد المستحقّ للمؤمِّنين", async () => {
    const srv = app.getHttpServer();
    const trustBefore = (await request(srv).get("/finance/summary").set(auth(gm)).expect(200)).body.offBalanceTrust as number;

    const requestId = await createAwardedRequest("direct");
    const policy = (await request(srv).post("/policies/issue").set(auth(underwriter))
      .send({ requestId, branchCode: "RUH", issuanceType: "POLICY", sumInsured: 500000, policyFees: 250 }).expect(201)).body;
    await request(srv).post(`/policies/${policy.id}/approve-technical`).set(auth(underwriter)).expect(200);
    const fin = (await request(srv).post(`/finance/policies/${policy.id}/approve`).set(auth(accountant)).expect(200)).body;
    expect(fin.status).toBe("ISSUED");
    expect(fin.collectionModel).toBe("direct"); // بُصِمت آلية العميل على الوثيقة
    expect(fin.debitNote).toMatch(/^DN-/); // إشعار مدين بالرسوم فقط (fees=250) — لا قسط

    const post = (await request(srv).get(`/finance/policies/${policy.id}/postings`).set(auth(accountant)).expect(200)).body;
    const entries = post.voucher.lines.entries as Array<{ account: string; debit: number; credit: number }>;
    const debit = entries.reduce((s, e) => s + Number(e.debit), 0);
    const credit = entries.reduce((s, e) => s + Number(e.credit), 0);
    expect(debit).toBeCloseTo(credit, 2); // القيد المزدوج متوازن

    expect(entries.some((e) => e.account.startsWith("0202"))).toBe(false); // لا أمانات في الدفع المباشر
    const commRecv = entries.find((e) => e.account.startsWith("0104")); // ذمّة عمولة على المؤمِّن
    expect(commRecv).toBeTruthy();
    expect(Number(commRecv!.debit)).toBeGreaterThan(0);
    // إشعار العميل بالرسوم فقط (العميل يدفع القسط للمؤمِّن مباشرةً)
    expect(Number(post.debitNote.netAmount)).toBe(250);
    expect(Number(post.debitNote.vatAmount)).toBe(37.5);
    // فاتورة عمولة على المؤمِّن قائمة في النموذجين
    expect(Number(post.invoice.netAmount)).toBeGreaterThan(0);

    // نظرة الأمانات لا تزيد بوثيقة الدفع المباشر (حارس الملخّص)
    const trustAfter = (await request(srv).get("/finance/summary").set(auth(gm)).expect(200)).body.offBalanceTrust as number;
    expect(trustAfter).toBeCloseTo(trustBefore, 2);
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

  it("وثيقة الفاتورة المطبوعة (بهوية المستأجر) تجمع البائع والطرف والمبالغ وZATCA", async () => {
    const srv = app.getHttpServer();
    const invs = (await request(srv).get("/finance/invoices").set(auth(gm)).expect(200)).body as Array<{ id: string; kind: string }>;
    expect(invs.length).toBeGreaterThan(0);
    const inv = invs[0];
    const doc = (await request(srv).get(`/finance/invoices/${inv.id}/document`).set(auth(gm)).expect(200)).body;
    expect(doc.invoice.id).toBe(inv.id);
    expect(doc.invoice.total).toBeGreaterThan(0);
    expect(Number((doc.invoice.net + doc.invoice.vat).toFixed(2))).toBe(doc.invoice.total); // صافي + ضريبة = الإجمالي
    expect(doc.seller.name).toBeTruthy();
    expect(doc.party.name).toBeTruthy();
    expect(doc.zatca.uuid).toBeTruthy();
    // امتثال ZATCA: رمز نوع الفاتورة + بنود مفصّلة بفئة/نسبة ضريبة + عنوان البائع المهيكل
    expect(doc.invoice.invoiceTypeCode).toBe("388");
    expect(Array.isArray(doc.lineItems)).toBe(true);
    expect(doc.lineItems.length).toBeGreaterThan(0);
    expect(["S", "E"]).toContain(doc.lineItems[0].taxCategory);
    expect(Number((doc.lineItems[0].net + doc.lineItems[0].taxAmount).toFixed(2))).toBe(doc.lineItems[0].lineTotal);
    expect(doc.seller.address).toBeDefined();
    expect(doc.party).toHaveProperty("vatNumber"); // رقم المشتري الضريبي (قد يكون null إن لم يُدخَل)
    // فاتورة مجهولة ⇒ 404
    await request(srv).get("/finance/invoices/nope-xyz/document").set(auth(gm)).expect(404);
  });

  it("نظرة المالك: قائمة دخل متّسقة (صافي = إيراد − عمولات فرعيين) + اتجاه 6 أشهر + عزل", async () => {
    const srv = app.getHttpServer();
    // مدير المبيعات (لا finance) ممنوع
    await request(srv).get("/finance/overview").set(auth(sales)).expect(403);

    const ov = (await request(srv).get("/finance/overview").set(auth(accountant)).expect(200)).body;
    // اتّساق قائمة الدخل
    expect(ov.incomeStatement.totalRevenue).toBe(Number((ov.incomeStatement.commissionIncome + ov.incomeStatement.serviceFees).toFixed(2)));
    expect(ov.incomeStatement.netIncome).toBe(Number((ov.incomeStatement.totalRevenue - ov.incomeStatement.subBrokerCommission).toFixed(2)));
    // إصدار وثائق سابقًا ⇒ إيراد موجب
    expect(ov.incomeStatement.commissionIncome).toBeGreaterThan(0);
    expect(ov.health.policyCount).toBeGreaterThan(0);
    // اتجاه من 6 أشهر بالضبط
    expect(Array.isArray(ov.trend)).toBe(true);
    expect(ov.trend).toHaveLength(6);
    // ضريبة القيمة المضافة ليست ضمن الإيراد (صافي القسط أكبر من العمولة عادةً؛ نتحقّق أن الإيراد ليس القسط الإجمالي)
    expect(ov.incomeStatement.totalRevenue).toBeLessThan(ov.health.gwp);

    // العزل: مستأجر الأمان لا يرى إنتاج الخليج في نظرته (نظرة مختلفة/معزولة)
    const amanOv = (await request(srv).get("/finance/overview").set(auth(amanGm)).expect(200)).body;
    expect(amanOv.health.gwp).not.toBe(ov.health.gwp);
  });

  it("القيود اليدوية والمصروفات: قيد متوازن يُرحَّل ويتدفّق لميزان المراجعة · غير المتوازن/العنوان/غير المخوّل يُرفض", async () => {
    const srv = app.getHttpServer();
    const SALARY = "05030000000000000"; // الرواتب والأجور (مصروف — ورقة)
    const CASH = "01010000000000000"; // النقد والبنوك (ورقة)

    // حسابات الترحيل تستثني العناوين (لا يظهر حساب المستوى 1 مثل "05")
    const accts = (await request(srv).get("/finance/posting-accounts").set(auth(accountant)).expect(200)).body as Array<{ code: string; accountType: string }>;
    expect(accts.some((a) => a.code === SALARY)).toBe(true);
    expect(accts.some((a) => a.code === "05000000000000000")).toBe(false); // العنوان غير قابل للترحيل
    expect(accts.some((a) => a.accountType === "expense")).toBe(true);

    // غير المخوّل (مبيعات) ⇒ 403
    await request(srv).post("/finance/journal").set(auth(sales)).send({ description: "محاولة", entries: [{ account: SALARY, debit: 100 }, { account: CASH, credit: 100 }] }).expect(403);

    // مصروف رواتب 5000 نقدًا ⇒ 201، ويتوازن الميزان
    const before = (await request(srv).get("/finance/trial-balance").set(auth(accountant)).expect(200)).body;
    const salaryDebitBefore = (before.rows.find((r: { account: string }) => r.account === SALARY)?.debit ?? 0) as number;
    const jv = (await request(srv).post("/finance/journal").set(auth(accountant)).send({
      description: "رواتب الموظفين — يناير", entries: [{ account: SALARY, debit: 5000 }, { account: CASH, credit: 5000 }],
    }).expect(201)).body;
    expect(jv.amount).toBe(5000);
    expect(jv.sequenceNo).toBeTruthy();

    const after = (await request(srv).get("/finance/trial-balance").set(auth(accountant)).expect(200)).body;
    expect(after.totals.balanced).toBe(true); // يبقى متوازنًا
    const salaryDebitAfter = (after.rows.find((r: { account: string }) => r.account === SALARY)?.debit ?? 0) as number;
    expect(Math.round((salaryDebitAfter - salaryDebitBefore) * 100) / 100).toBe(5000); // القيد تدفّق للحساب

    // يظهر في سجلّ القيود اليدوية
    const log = (await request(srv).get("/finance/journal").set(auth(accountant)).expect(200)).body as Array<{ id: string }>;
    expect(log.some((v) => v.id === jv.id)).toBe(true);

    // غير المتوازن ⇒ 422
    await request(srv).post("/finance/journal").set(auth(accountant)).send({ description: "غير متوازن", entries: [{ account: SALARY, debit: 5000 }, { account: CASH, credit: 4000 }] }).expect(422);
    // الترحيل لحساب عنوان (05) ⇒ 400
    await request(srv).post("/finance/journal").set(auth(accountant)).send({ description: "عنوان", entries: [{ account: "05000000000000000", debit: 100 }, { account: CASH, credit: 100 }] }).expect(400);
    // سطر واحد فقط ⇒ 400
    await request(srv).post("/finance/journal").set(auth(accountant)).send({ description: "طرف واحد", entries: [{ account: SALARY, debit: 100 }] }).expect(400);
  });

  it("عمولات الموظفين: ضبط النسبة + دفتر (متوقّعة/مستحقّة) + صرف بحدّ المستحقّ + عزل", async () => {
    const srv = app.getHttpServer();
    // ضبط نسبة عمولة موظف (gm له settings) — صحيح 200 · خاطئ (>100) 400
    const staff = (await request(srv).get("/staff").set(auth(gm)).expect(200)).body as Array<{ id: string }>;
    await request(srv).post(`/staff/${staff[0].id}/commission-rate`).set(auth(gm)).send({ rate: 7.5 }).expect(200);
    await request(srv).post(`/staff/${staff[0].id}/commission-rate`).set(auth(gm)).send({ rate: 150 }).expect(400);

    // الدفتر: عزل (المبيعات لا finance) 403 · البنية + بيانات مزروعة
    await request(srv).get("/finance/employee-commissions").set(auth(sales)).expect(403);
    const led = (await request(srv).get("/finance/employee-commissions").set(auth(accountant)).expect(200)).body as { rows: Array<{ userId: string; accrued: number; eligible: number; outstanding: number }>; summary: { outstanding: number } };
    expect(Array.isArray(led.rows)).toBe(true);
    expect(led.summary).toHaveProperty("outstanding");
    // موظف مزروع بعمولات متوقّعة (waleed/sara مندوبان على وثائق الخليج)
    const withAccrued = led.rows.find((r) => r.accrued > 0);
    expect(withAccrued).toBeTruthy();
    // الاستحقاق ≤ المتوقّع (لا يُحتسب مستحقًّا إلا المُحصَّل)
    for (const r of led.rows) expect(r.eligible).toBeLessThanOrEqual(r.accrued + 0.01);

    // صرف: تجاوز المتبقّي ⇒ 409
    await request(srv).post(`/finance/employee-commissions/${led.rows[0].userId}/settle`).set(auth(accountant)).send({ amount: led.rows[0].outstanding + 100000 }).expect(409);
    // إن وُجد مستحقّ ⇒ صرف جزئي 201 (سند PYV) ويُنقص المتبقّي
    const payable = led.rows.find((r) => r.outstanding > 1);
    if (payable) {
      const res = (await request(srv).post(`/finance/employee-commissions/${payable.userId}/settle`).set(auth(accountant)).send({ amount: 1 }).expect(201)).body;
      expect(res.voucher.sequenceNo).toBeTruthy();
      expect(res.outstanding).toBe(Number((payable.outstanding - 1).toFixed(2)));
    }
    // غير المخوّل يُمنع من الصرف
    await request(srv).post(`/finance/employee-commissions/${led.rows[0].userId}/settle`).set(auth(sales)).send({ amount: 1 }).expect(403);
  });

  it("#2.1 التقسيط: خطة تقسّم الإجمالي (الأخيرة تمتصّ التقريب) + التحصيل بالأقدم استحقاقًا (شلال) + الحواجز", async () => {
    const srv = app.getHttpServer();
    const requestId = await createAwardedRequest();
    const policy = (await request(srv).post("/policies/issue").set(auth(underwriter)).send({ requestId, branchCode: "RUH" }).expect(201)).body;
    await request(srv).post(`/policies/${policy.id}/approve-technical`).set(auth(underwriter)).expect(200);
    const fin = (await request(srv).post(`/finance/policies/${policy.id}/approve`).set(auth(accountant)).expect(200)).body;
    const note = (await request(srv).get("/finance/receivables").set(auth(accountant))).body.notes.find((n: { sequenceNo: string }) => n.sequenceNo === fin.debitNote);
    const total = note.total as number; // 69000

    // الحواجز: عدد < 2 ⇒ 400 · غير المخوّل (مبيعات) ⇒ 403
    await request(srv).post(`/finance/debit-notes/${note.id}/installments`).set(auth(accountant)).send({ count: 1 }).expect(400);
    await request(srv).post(`/finance/debit-notes/${note.id}/installments`).set(auth(sales)).send({ count: 3 }).expect(403);

    // خطة 7 دفعات (تاريخ مستقبلي حتمي) ⇒ المجموع == الإجمالي (الأخيرة تمتصّ فرق التقريب)
    const plan = (await request(srv).post(`/finance/debit-notes/${note.id}/installments`).set(auth(accountant)).send({ count: 7, firstDueDate: "2099-01-15" }).expect(201)).body;
    expect(plan.installments).toHaveLength(7);
    const sum = plan.installments.reduce((s: number, r: { amount: number }) => s + r.amount, 0);
    expect(Number(sum.toFixed(2))).toBe(total); // لا يضيع ولا يُخلق قرش
    expect(plan.installments.map((r: { seq: number }) => r.seq)).toEqual([1, 2, 3, 4, 5, 6, 7]); // تسلسل
    expect(plan.installments[0].dueDate.slice(0, 10)).toBe("2099-01-15");
    expect(plan.installments[1].dueDate.slice(0, 10)).toBe("2099-02-15"); // استحقاق شهري تصاعدي
    expect(plan.installments.every((r: { status: string }) => r.status === "due")).toBe(true); // كلها قادمة (مستقبلية)

    // إعادة إنشاء خطة على نفس الإشعار ⇒ 409
    await request(srv).post(`/finance/debit-notes/${note.id}/installments`).set(auth(accountant)).send({ count: 3 }).expect(409);

    // التحصيل يُطبَّق بالأقدم استحقاقًا: سند قبض بقيمة أول قسطين ⇒ 1و2 مسدَّدان، 3 يبقى مستحقًّا بلا تحصيل
    const two = Number((plan.installments[0].amount + plan.installments[1].amount).toFixed(2));
    await request(srv).post(`/finance/debit-notes/${note.id}/receipt`).set(auth(accountant)).send({ amount: two, method: "transfer" }).expect(201);
    const sched = (await request(srv).get(`/finance/debit-notes/${note.id}/installments`).set(auth(accountant)).expect(200)).body as Array<{ seq: number; status: string; settled: number; outstanding: number }>;
    expect(sched.find((r) => r.seq === 1)!.status).toBe("paid");
    expect(sched.find((r) => r.seq === 2)!.status).toBe("paid");
    expect(sched.find((r) => r.seq === 3)!.status).toBe("due"); // لم يصله تحصيل بعد
    expect(sched.find((r) => r.seq === 3)!.settled).toBe(0);
  });

  it("#2.1 التقسيط: تحصيل سابق للخطة يُرحَّل على الأقساط (مسدَّد/جزئي) + المتأخّر يُحتسب من تاريخ الاستحقاق", async () => {
    const srv = app.getHttpServer();
    const requestId = await createAwardedRequest();
    const policy = (await request(srv).post("/policies/issue").set(auth(underwriter)).send({ requestId, branchCode: "RUH" }).expect(201)).body;
    await request(srv).post(`/policies/${policy.id}/approve-technical`).set(auth(underwriter)).expect(200);
    const fin = (await request(srv).post(`/finance/policies/${policy.id}/approve`).set(auth(accountant)).expect(200)).body;
    const note = (await request(srv).get("/finance/receivables").set(auth(accountant))).body.notes.find((n: { sequenceNo: string }) => n.sequenceNo === fin.debitNote);

    // تحصيل 25000 قبل إنشاء الخطة (لا أقساط بعد)
    await request(srv).post(`/finance/debit-notes/${note.id}/receipt`).set(auth(accountant)).send({ amount: 25000, method: "transfer" }).expect(201);

    // خطة 3 دفعات (23000 لكلٍّ) بتاريخ ماضٍ حتمي ⇒ يُرحَّل المُحصَّل السابق بالأقدم استحقاقًا
    const plan = (await request(srv).post(`/finance/debit-notes/${note.id}/installments`).set(auth(accountant)).send({ count: 3, firstDueDate: "2020-01-01" }).expect(201)).body;
    const inst = plan.installments as Array<{ seq: number; status: string; settled: number }>;
    expect(inst.find((r) => r.seq === 1)!.status).toBe("paid"); // 23000 ← 25000
    expect(inst.find((r) => r.seq === 2)!.status).toBe("partial"); // 2000 المتبقّية
    expect(inst.find((r) => r.seq === 2)!.settled).toBe(2000);
    expect(inst.find((r) => r.seq === 3)!.status).toBe("overdue"); // 2020 ماضٍ + بلا تحصيل
  });

  it("#1.2 الميزانية العمومية: أصول = خصوم + حقوق ملكية (+ صافي دخل) · تُصنّف الأمانات خارج الميزانية · لا حساب بلا تصنيف · RBAC", async () => {
    const srv = app.getHttpServer();
    // إصدار واعتماد وثيقة يضمن حركة حسابات (ذمم/أمانات/عمولة/ضريبة)
    const requestId = await createAwardedRequest();
    const policy = (await request(srv).post("/policies/issue").set(auth(underwriter)).send({ requestId, branchCode: "RUH" }).expect(201)).body;
    await request(srv).post(`/policies/${policy.id}/approve-technical`).set(auth(underwriter)).expect(200);
    await request(srv).post(`/finance/policies/${policy.id}/approve`).set(auth(accountant)).expect(200);

    // المبيعات (لا finance) ⇒ 403
    await request(srv).get("/finance/balance-sheet").set(auth(sales)).expect(403);

    const bs = (await request(srv).get("/finance/balance-sheet").set(auth(accountant)).expect(200)).body;
    // المعادلة المحاسبية متوازنة: الأصول = الخصوم + حقوق الملكية (شاملةً صافي الدخل)
    expect(bs.totals.balanced).toBe(true);
    expect(bs.totals.assets).toBeCloseTo(bs.totals.liabilitiesAndEquity, 2);
    // كل الحسابات مُصنّفة (accountType مضبوط في شجرة الحسابات المُثراة)
    expect(bs.unclassified).toHaveLength(0);
    // الأمانات (أموال العملاء للمؤمِّن) بند خصوم لكن خارج الميزانية — مُعلَّم ومذكور
    const trust = (bs.liabilities as Array<{ code: string; isOnBalance: boolean }>).find((l) => l.code.startsWith("0202"));
    if (trust) { expect(trust.isOnBalance).toBe(false); expect(bs.totals.offBalance).toBeGreaterThan(0); }
    // صافي الدخل (الأرباح المُبقاة) بند ضمن حقوق الملكية
    expect(bs).toHaveProperty("retainedEarnings");
    expect(typeof bs.totals.equity).toBe("number");
  });

  it("#1.4 دفتر الأستاذ: يجمع أطراف حساب برصيد جارٍ يطابق ميزان المراجعة · حساب مجهول 404 · RBAC", async () => {
    const srv = app.getHttpServer();
    const AR = "01030000000000000"; // ذمم العملاء المدينة (تتحرّك مع كل إصدار)
    const requestId = await createAwardedRequest();
    const policy = (await request(srv).post("/policies/issue").set(auth(underwriter)).send({ requestId, branchCode: "RUH" }).expect(201)).body;
    await request(srv).post(`/policies/${policy.id}/approve-technical`).set(auth(underwriter)).expect(200);
    await request(srv).post(`/finance/policies/${policy.id}/approve`).set(auth(accountant)).expect(200);

    // المبيعات (لا finance) ⇒ 403 · حساب مجهول ⇒ 404
    await request(srv).get(`/finance/ledger/${AR}`).set(auth(sales)).expect(403);
    await request(srv).get("/finance/ledger/09999999999999999").set(auth(accountant)).expect(404);

    const led = (await request(srv).get(`/finance/ledger/${AR}`).set(auth(accountant)).expect(200)).body;
    expect(led.rows.length).toBeGreaterThan(0);
    // الرصيد الجارٍ في آخر سطر = مجموع المدين − الدائن = رصيد الحساب في ميزان المراجعة
    const last = led.rows[led.rows.length - 1];
    expect(last.balance).toBeCloseTo(r2(led.totals.debit - led.totals.credit), 2);
    const tb = (await request(srv).get("/finance/trial-balance").set(auth(accountant)).expect(200)).body;
    const tbRow = (tb.rows as Array<{ account: string; balance: number }>).find((r) => r.account === AR);
    expect(last.balance).toBeCloseTo(tbRow!.balance, 2);
  });

  it("#1.5 إقرار ض.ق.م: المخرجات − المدخلات = صافي المستحقّ · المدخلات تُخفّض الصافي · فترة ماضية أصفار · RBAC", async () => {
    const srv = app.getHttpServer();
    const requestId = await createAwardedRequest();
    const policy = (await request(srv).post("/policies/issue").set(auth(underwriter)).send({ requestId, branchCode: "RUH" }).expect(201)).body;
    await request(srv).post(`/policies/${policy.id}/approve-technical`).set(auth(underwriter)).expect(200);
    await request(srv).post(`/finance/policies/${policy.id}/approve`).set(auth(accountant)).expect(200);

    // المبيعات (لا finance) ⇒ 403
    await request(srv).get("/finance/vat-return").set(auth(sales)).expect(403);

    const before = (await request(srv).get("/finance/vat-return").set(auth(accountant)).expect(200)).body;
    expect(before.outputVat).toBeGreaterThan(0); // ضريبة مخرجات من الإصدار
    expect(before.netVat).toBeCloseTo(r2(before.outputVat - before.inputVat), 2); // الصافي = المخرجات − المدخلات
    expect(before.taxableStandard).toBeCloseTo(r2(before.outputVat / 0.15), 2); // القاعدة الخاضعة ÷15%

    // مصروف بضريبة مدخلات: مدين رواتب 1000 + مدين ضريبة مدخلات 150 + دائن نقد 1150
    await request(srv).post("/finance/journal").set(auth(accountant)).send({
      description: "مصروف بضريبة مدخلات", entries: [
        { account: "05030000000000000", debit: 1000 },
        { account: "01050000000000000", debit: 150 },
        { account: "01010000000000000", credit: 1150 },
      ],
    }).expect(201);

    const after = (await request(srv).get("/finance/vat-return").set(auth(accountant)).expect(200)).body;
    expect(after.inputVat).toBeCloseTo(r2(before.inputVat + 150), 2); // ازدادت ضريبة المدخلات 150
    expect(after.netVat).toBeCloseTo(r2(before.netVat - 150), 2); // انخفض الصافي بمقدار المدخلات

    // فترة ماضية بلا حركة ⇒ أصفار
    const past = (await request(srv).get("/finance/vat-return?from=2020-01-01&to=2020-12-31").set(auth(accountant)).expect(200)).body;
    expect(past.outputVat).toBe(0);
    expect(past.inputVat).toBe(0);
    expect(past.netVat).toBe(0);
  });
});

/** تقريب لخانتين — مساعد اختبار مطابق لمنطق الخدمة. */
function r2(n: number): number { return Math.round(n * 100) / 100; }
