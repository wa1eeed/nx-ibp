/**
 * اختبار ZATCA (Fatoora) المرحلة 2 — تحقّق:
 *  - خطّ التهيئة (CSR ⇒ OTP ⇒ Compliance ⇒ PCSID/ACTIVE).
 *  - عزل المستأجرين: لا يقرأ مستأجر تهيئة/سلسلة تجزئة مستأجر آخر.
 *  - تحقّق البنية: 422 لرقم ضريبي خاطئ.
 *  - توليد مستندات الفوترة عبر الاعتماد المالي: UUIDv4، عدّاد معزول، سلسلة تجزئة، QR (TLV).
 *  - التوجيه: B2B مقاصة فورية (CLEARED) · B2C إبلاغ خلفي (REPORTED بعد التصريف).
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("ZATCA Fatoora المرحلة 2 (e2e)", () => {
  let app: INestApplication;
  let gm: string; // الخليج (demo-tenant) — إدارة/إصدار
  let accountant: string; // محاسب الخليج — الاعتماد المالي (فصل المهام)
  let omar: string; // الأمان (demo-tenant-2)
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  let srv: ReturnType<INestApplication["getHttpServer"]>;

  // سلسلة صفقة كاملة حتى الاعتماد المالي ⇒ تُولّد مستندَي فوترة (إشعار مدين + فاتورة عمولة)
  // الاعتماد المالي بمستخدم مختلف عن المُصدِر (فصل المهام — مُفعَّل افتراضيًا).
  async function approveDeal(token: string, financeToken: string, type: "CORPORATE" | "INDIVIDUAL") {
    const ts = Date.now() + Math.floor(Math.random() * 1e6);
    const id = type === "CORPORATE" ? { crNumber: `40${ts}`.slice(0, 10) } : { nationalId: `10${ts}`.slice(0, 10) };
    const c = await request(srv).post("/clients").set(auth(token)).send({ type, name: `زبون ${ts}`, city: "الرياض", ...id });
    await request(srv).post(`/clients/${c.body.id}/compliance`).set(auth(token)).send({ decision: "APPROVED" });
    const r = await request(srv).post("/requests").set(auth(token)).send({ clientId: c.body.id, productLineCode: "PAR", base: { insuredName: "ز", startDate: "2026-07-01", endDate: "2027-06-30" }, blocks: { locations: [{ description: "م", city: "الرياض" }] } });
    const s = await request(srv).post("/slips").set(auth(token)).send({ requestId: r.body.id });
    const q = await request(srv).post(`/slips/${s.body.id}/quotations`).set(auth(token)).send({ insurerName: "التعاونية", rate: 2, premium: 40000, vat: 6000, totalPremium: 46000, deductible: 500, limit: 500000 });
    await request(srv).post(`/slips/${s.body.id}/select`).set(auth(token)).send({ quotationId: q.body.id });
    const p = await request(srv).post("/policies/issue").set(auth(token)).send({ requestId: r.body.id });
    await request(srv).post(`/policies/${p.body.id}/approve-technical`).set(auth(token));
    return request(srv).post(`/finance/policies/${p.body.id}/approve`).set(auth(financeToken));
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    srv = app.getHttpServer();
    gm = (await request(srv).post("/auth/login").send({ email: "waleed@gulf-demo.sa", password: "Passw0rd!" })).body.accessToken;
    accountant = (await request(srv).post("/auth/login").send({ email: "laila@gulf-demo.sa", password: "Passw0rd!" })).body.accessToken;
    omar = (await request(srv).post("/auth/login").send({ email: "omar@aman-demo.sa", password: "Passw0rd!" })).body.accessToken;
    // عزل: صفّر سلسلة اعتماد الخليج للافتراضي (قد تُبقيها اختبارات أخرى بخطوات/فصل فنّي على القاعدة المشتركة)
    // حتى يعمل approveDeal (المُصدِر نفسه يعتمد فنيًا + محاسب يعتمد ماليًا ⇒ ISSUED).
    await request(srv).put("/config/approval-chain").set(auth(gm)).send({ technicalGate: true, technicalSegregation: false, steps: [] });
  });
  afterAll(async () => { await app?.close(); });

  it("تهيئة المستأجر موجودة ومعزولة (كلٌّ يرى رقمه الضريبي فقط)", async () => {
    const a = await request(srv).get("/zatca/config").set(auth(gm)).expect(200);
    const b = await request(srv).get("/zatca/config").set(auth(omar)).expect(200);
    expect(a.body.vatNumber).toMatch(/^3\d{13}3$/);
    expect(b.body.vatNumber).toMatch(/^3\d{13}3$/);
    expect(a.body.vatNumber).not.toBe(b.body.vatNumber); // عزل
  });

  it("تحقّق البنية: رقم ضريبي خاطئ ⇒ 422", () =>
    request(srv).put("/zatca/config").set(auth(gm)).send({ vatNumber: "12345", businessNameAr: "x" }).expect(422));

  it("خطّ التهيئة الكامل (CSR ⇒ OTP ⇒ Compliance ⇒ ACTIVE)", async () => {
    const csr = await request(srv).post("/zatca/onboard/generate-csr").set(auth(omar)).expect(200);
    expect(csr.body.onboardingStatus).toBe("CSR_GENERATED");
    expect(csr.body.csrPem).toContain("BEGIN CERTIFICATE REQUEST");
    await request(srv).post("/zatca/onboard/exchange-otp").set(auth(omar)).send({ otp: "123456" }).expect(200);
    const comp = await request(srv).post("/zatca/onboard/run-compliance").set(auth(omar)).expect(200);
    expect(comp.body.onboardingStatus).toBe("COMPLIANCE_PASSED");
    expect(comp.body.results.length).toBe(3); // فاتورة + إشعار دائن + إشعار مدين
    const fin = await request(srv).post("/zatca/onboard/finalize").set(auth(omar)).expect(200);
    expect(fin.body.onboardingStatus).toBe("ACTIVE");
  });

  it("التهيئة بصلاحية الإعدادات فقط — OTP بدون رمز صحيح ⇒ 400", () =>
    request(srv).post("/zatca/onboard/exchange-otp").set(auth(gm)).send({ otp: "12" }).expect(400));

  it("الاعتماد المالي يولّد مستندات فوترة متوافقة (UUID + عدّاد + سلسلة تجزئة + QR)", async () => {
    const res = await approveDeal(gm, accountant, "CORPORATE");
    expect(res.body.status).toBe("ISSUED");
    expect(res.body.billingDocuments).toBe(2); // إشعار مدين + فاتورة عمولة

    const list = (await request(srv).get("/zatca/billing-documents").set(auth(gm)).expect(200)).body as Array<Record<string, unknown>>;
    expect(list.length).toBeGreaterThanOrEqual(2);
    const top = list[0];
    expect(String(top.uuid)).toMatch(UUID_V4);
    expect(String(top.qrTlv).length).toBeGreaterThan(10);
    expect(["TAX_INVOICE", "DEBIT_NOTE"]).toContain(top.documentType);

    // سلسلة التجزئة: مرتّبة بالعدّاد تنازلياً ⇒ previousHash لكل مستند = hash المستند الأدنى عدّاداً
    const byCounterAsc = [...list].sort((a, b) => Number(a.counter) - Number(b.counter));
    let chained = 0;
    for (let i = 1; i < byCounterAsc.length; i++) {
      if (byCounterAsc[i].previousHash === byCounterAsc[i - 1].hash) chained++;
    }
    expect(chained).toBeGreaterThanOrEqual(1);
  });

  it("التوجيه B2B (منشأة) ⇒ مقاصة فورية CLEARED", async () => {
    await approveDeal(gm, accountant, "CORPORATE");
    const list = (await request(srv).get("/zatca/billing-documents").set(auth(gm))).body as Array<Record<string, unknown>>;
    const b2b = list.find((d) => d.invoiceSubtype === "STANDARD_B2B");
    expect(b2b?.zatcaFlow).toBe("CLEARANCE");
    expect(b2b?.zatcaStatus).toBe("CLEARED");
  });

  it("التوجيه B2C (فرد) ⇒ إبلاغ خلفي يُصبح REPORTED بعد التصريف", async () => {
    await approveDeal(gm, accountant, "INDIVIDUAL");
    await request(srv).post("/zatca/reporting/drain").set(auth(gm)).expect(200);
    const list = (await request(srv).get("/zatca/billing-documents").set(auth(gm))).body as Array<Record<string, unknown>>;
    const b2c = list.find((d) => d.invoiceSubtype === "SIMPLIFIED_B2C");
    expect(b2c?.zatcaFlow).toBe("REPORTING");
    expect(b2c?.zatcaStatus).toBe("REPORTED");
  });

  it("عزل سلسلة التجزئة: المستأجر الثاني لا يرى مستندات الأول", async () => {
    const gmList = (await request(srv).get("/zatca/billing-documents").set(auth(gm))).body as Array<{ uuid: string }>;
    const omarList = (await request(srv).get("/zatca/billing-documents").set(auth(omar))).body as Array<{ uuid: string }>;
    const gmUuids = new Set(gmList.map((d) => d.uuid));
    expect(omarList.every((d) => !gmUuids.has(d.uuid))).toBe(true);
  });
});
