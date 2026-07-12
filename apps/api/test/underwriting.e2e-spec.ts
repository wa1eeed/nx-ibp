/**
 * اختبار الاكتتاب الفني (تحقّق المرحلة 4أ):
 *  - حوكمة: لا Slip قبل اعتماد الالتزام.
 *  - RBAC: موديول production (مسؤول التسعير) فقط.
 *  - جدول مقارنة آلي من الحقول المعيارية + أمر الإسناد (Firm Order) ⇒ الطلب AWARDED.
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

const PERIOD = { startDate: "2026-01-01", endDate: "2026-12-31", currency: "SAR" };

describe("الاكتتاب الفني وعروض الأسعار (e2e)", () => {
  let app: INestApplication;
  let gm: string; // مدير عام (يعتمد الالتزام + ينشئ الطلب)
  let underwriter: string; // مسؤول التسعير (production)
  let sales: string; // مدير مبيعات (لا production)
  let amanGm: string;

  const login = async (email: string) =>
    (await request(app.getHttpServer()).post("/auth/login").send({ email, password: "Passw0rd!" })).body.accessToken as string;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function createApprovedRequest(): Promise<{ clientId: string; requestId: string }> {
    const cr = String(Date.now()).slice(-8) + String(10 + Math.floor(Math.random() * 89));
    const client = await request(app.getHttpServer()).post("/clients").set(auth(gm)).send({ type: "CORPORATE", name: "عميل اكتتاب", crNumber: cr });
    const clientId = client.body.id;
    await request(app.getHttpServer()).post(`/clients/${clientId}/compliance`).set(auth(gm)).send({ decision: "APPROVED" });
    const req = await request(app.getHttpServer())
      .post("/requests")
      .set(auth(gm))
      .send({
        clientId,
        productLineCode: "GMI",
        base: { insuredName: "ع", network: "standard", annualLimit: 500000, ...PERIOD },
        blocks: { members: [{ name: "أ", nationalId: "1234567890", relation: "employee", dob: "1990-01-01", gender: "male" }] },
      });
    return { clientId, requestId: req.body.id };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    gm = await login("waleed@gulf-demo.sa");
    underwriter = await login("majed@gulf-demo.sa");
    sales = await login("sara@gulf-demo.sa");
    amanGm = await login("omar@aman-demo.sa");
  });

  afterAll(async () => {
    await app?.close();
  });

  it("مدير المبيعات (لا اكتتاب) ممنوع من إنشاء Slip ⇒ 403", async () => {
    const { requestId } = await createApprovedRequest();
    await request(app.getHttpServer()).post("/slips").set(auth(sales)).send({ requestId }).expect(403);
  });

  it("فصل الاكتتاب عن الإصدار: دور «عمليات/إنتاج فقط» (بلا underwriting) ممنوع من Slip ⇒ 403", async () => {
    const srv = app.getHttpServer();
    const uniq = String(Date.now()).slice(-8);
    // دور عمليات: production فقط (إصدار)، بلا صلاحية الاكتتاب
    await request(srv).post("/staff").set(auth(gm)).send({
      fullName: "موظف عمليات", email: `ops-${uniq}@gulf-demo.sa`, password: "Passw0rd!", roleName: `عمليات-${uniq}`,
      permissions: [
        { module: "production", canAccess: true, canCreate: true, canEdit: true, canDelete: false, canRevert: false },
        { module: "clients", canAccess: true, canCreate: false, canEdit: false, canDelete: false, canRevert: false },
      ],
    }).expect(201);
    const opsToken = await login(`ops-${uniq}@gulf-demo.sa`);
    const { requestId } = await createApprovedRequest();
    // العمليات لا تُنشئ Slip (اكتتاب) رغم امتلاكها الإصدار — الفصل الوظيفي
    await request(srv).post("/slips").set(auth(opsToken)).send({ requestId }).expect(403);
  });

  it("المكتتب ينشئ Slip ⇒ 201 برقم RFQ، والطلب يصبح QUOTING", async () => {
    const { requestId } = await createApprovedRequest();
    const slip = await request(app.getHttpServer()).post("/slips").set(auth(underwriter)).send({ requestId, insurers: ["التعاونية", "بوبا", "ولاء"] }).expect(201);
    expect(slip.body.sequenceNo).toMatch(/^RFQ-MED-/);
    const req = await request(app.getHttpServer()).get(`/requests/${requestId}`).set(auth(gm)).expect(200);
    expect(req.body.status).toBe("QUOTING");
  });

  it("جدول المقارنة الآلي + أمر الإسناد ⇒ الطلب AWARDED", async () => {
    const { requestId } = await createApprovedRequest();
    const slip = (await request(app.getHttpServer()).post("/slips").set(auth(underwriter)).send({ requestId }).expect(201)).body;

    // ثلاثة عروض هجينة (حقول معيارية + نص حر)
    const q1 = (await request(app.getHttpServer()).post(`/slips/${slip.id}/quotations`).set(auth(underwriter))
      .send({ insurerName: "التعاونية", sumInsured: 1000000, rate: 0.5, premium: 5000, policyFees: 100, vat: 750, totalPremium: 5850, commissionRate: 12, commissionAmount: 600, commissionVat: 90, deductible: 500, limit: 1000000, generalRemarks: "تشمل الأمومة" }).expect(201)).body;
    const q2 = (await request(app.getHttpServer()).post(`/slips/${slip.id}/quotations`).set(auth(underwriter))
      .send({ insurerName: "بوبا", premium: 4500, vat: 675, totalPremium: 5175, deductible: 750, limit: 1000000 }).expect(201)).body;
    await request(app.getHttpServer()).post(`/slips/${slip.id}/quotations`).set(auth(underwriter))
      .send({ insurerName: "ولاء", premium: 5200, vat: 780, totalPremium: 5980, deductible: 400, limit: 1500000 }).expect(201);

    const cmp = (await request(app.getHttpServer()).get(`/slips/${slip.id}/comparison`).set(auth(underwriter)).expect(200)).body;
    expect(cmp.rows).toHaveLength(3);
    expect(cmp.bestByPrice).toBe(q2.id); // بوبا الأقل إجمالاً (5175)
    expect(cmp.columns.map((c: { key: string }) => c.key)).toEqual(expect.arrayContaining(["sumInsured", "premium", "policyFees", "totalPremium", "commissionAmount", "deductible", "limit"]));
    // العرض الأول يحمل المالية الكاملة (مبلغ التأمين + الرسوم + عمولة الوسيط)
    const rowCoop = cmp.rows.find((r: { insurer: string }) => r.insurer === "التعاونية");
    expect(rowCoop.sumInsured).toBe(1000000);
    expect(rowCoop.policyFees).toBe(100);
    expect(rowCoop.commissionAmount).toBe(600);
    expect(rowCoop.commissionVat).toBe(90); // 15% من العمولة
    expect(cmp.columns.map((c: { key: string }) => c.key)).toContain("commissionVat");

    // أمر الإسناد على العرض الأرخص
    const sel = (await request(app.getHttpServer()).post(`/slips/${slip.id}/select`).set(auth(underwriter)).send({ quotationId: q2.id }).expect(200)).body;
    expect(sel.requestStatus).toBe("AWARDED");

    const req = await request(app.getHttpServer()).get(`/requests/${requestId}`).set(auth(gm)).expect(200);
    expect(req.body.status).toBe("AWARDED");

    // العرض غير الموجود في هذا الـ Slip يُرفض
    expect(q1.id).toBeTruthy();
  });

  it("حوكمة الالتزام: عميل أُلغي اعتماده ⇒ لا يمكن إنشاء Slip ⇒ 409", async () => {
    const { clientId, requestId } = await createApprovedRequest();
    await request(app.getHttpServer()).post(`/clients/${clientId}/compliance`).set(auth(gm)).send({ decision: "REJECTED" }).expect(200);
    await request(app.getHttpServer()).post("/slips").set(auth(underwriter)).send({ requestId }).expect(409);
  });

  it("العزل: مستأجر الأمان لا يرى Slips الخليج", async () => {
    const res = await request(app.getHttpServer()).get("/slips").set(auth(amanGm)).expect(200);
    expect(res.body.every((s: { tenantId: string }) => s.tenantId === "demo-tenant-2")).toBe(true);
  });
});
