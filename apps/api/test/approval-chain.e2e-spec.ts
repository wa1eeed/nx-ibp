/**
 * اختبار E2 — سلسلة اعتماد الوثيقة القابلة للتهيئة:
 *  - مالك الحساب يضيف خطوة اعتماد إضافية (بين الفني والمالي) لكل خطوة وحدتها المطلوبة.
 *  - بعد الموافقة الفنية تُحجَز الخطوة على الوثيقة، و**الاعتماد المالي محجوب** حتى تُعتمد.
 *  - الموافقة على الخطوة تتحقّق ديناميكيًا من صلاحية المستخدم (وحدة/فعل الخطوة).
 * يُعاد ضبط السلسلة إلى فارغة في النهاية كي لا تتأثّر بقيّة الاختبارات (قاعدة مشتركة).
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

const PERIOD = { startDate: "2026-01-01", endDate: "2026-12-31", currency: "SAR" };
const STEP = { key: "manager", name: "موافقة المدير", module: "compliance", action: "update" };

describe("سلسلة اعتماد الوثيقة القابلة للتهيئة — E2 (e2e)", () => {
  let app: INestApplication;
  let gm: string, underwriter: string, accountant: string;
  let approver = "", nonApprover = "";

  const login = async (email: string, password = "Passw0rd!") =>
    (await request(app.getHttpServer()).post("/auth/login").send({ email, password })).body.accessToken as string;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const perm = (module: string, canAccess: boolean, canEdit = false) => ({ module, canAccess, canCreate: false, canEdit, canDelete: false });

  async function createAwardedRequest(): Promise<string> {
    const cr = String(Date.now()).slice(-9) + Math.floor(Math.random() * 90);
    const client = await request(app.getHttpServer()).post("/clients").set(auth(gm)).send({ type: "CORPORATE", name: "عميل اعتماد", crNumber: cr });
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
    // معتمِد الخطوة له صلاحية compliance:update؛ وآخر بلا صلاحيتها
    const uniq = String(Date.now()).slice(-8);
    const aEmail = `approver-${uniq}@gulf-demo.sa`, nEmail = `noapprove-${uniq}@gulf-demo.sa`;
    await request(app.getHttpServer()).post("/staff").set(auth(gm)).send({ fullName: "معتمِد", email: aEmail, password: "Passw0rd1", roleName: `معتمِد-${uniq}`, permissions: [perm("compliance", true, true)] }).expect(201);
    await request(app.getHttpServer()).post("/staff").set(auth(gm)).send({ fullName: "بلا اعتماد", email: nEmail, password: "Passw0rd1", roleName: `بلا-${uniq}`, permissions: [perm("dashboard", true)] }).expect(201);
    approver = await login(aEmail, "Passw0rd1");
    nonApprover = await login(nEmail, "Passw0rd1");
    // تهيئة السلسلة: خطوة مدير إضافية
    await request(app.getHttpServer()).put("/config/approval-chain").set(auth(gm)).send({ steps: [STEP] }).expect(200);
  });

  afterAll(async () => {
    // إعادة الضبط لفارغة كي لا تتأثّر بقيّة الاختبارات
    if (gm) await request(app.getHttpServer()).put("/config/approval-chain").set(auth(gm)).send({ steps: [] });
    await app?.close();
  });

  it("قراءة السلسلة تُظهر الخطوة المُهيّأة", async () => {
    const res = await request(app.getHttpServer()).get("/config/approval-chain").set(auth(gm)).expect(200);
    expect(res.body.steps).toHaveLength(1);
    expect(res.body.steps[0].key).toBe("manager");
    expect(res.body.steps[0].module).toBe("compliance");
  });

  it("خطوة بوحدة غير معروفة ⇒ 400", () =>
    request(app.getHttpServer()).put("/config/approval-chain").set(auth(gm)).send({ steps: [{ key: "x", name: "x", module: "nope", action: "update" }] }).expect(400));

  it("الشلال بخطوة إضافية: المالية محجوبة حتى تُعتمد الخطوة، والصلاحية ديناميكية", async () => {
    const requestId = await createAwardedRequest();
    const policy = (await request(app.getHttpServer()).post("/policies/issue").set(auth(underwriter)).send({ requestId, branchCode: "RUH", issuanceType: "POLICY" }).expect(201)).body;

    // الموافقة الفنية ⇒ تُحجَز الخطوة على الوثيقة
    const tech = (await request(app.getHttpServer()).post(`/policies/${policy.id}/approve-technical`).set(auth(underwriter)).expect(200)).body;
    expect(tech.pendingApprovals).toEqual(["manager"]);

    // الاعتماد المالي محجوب الآن
    await request(app.getHttpServer()).post(`/finance/policies/${policy.id}/approve`).set(auth(accountant)).expect(409);

    // من لا يملك صلاحية وحدة الخطوة (compliance) ⇒ 403
    await request(app.getHttpServer()).post(`/policies/${policy.id}/approve-step`).set(auth(nonApprover)).send({ stepKey: "manager" }).expect(403);

    // المعتمِد يوافق على الخطوة ⇒ تُفرَّغ
    const step = (await request(app.getHttpServer()).post(`/policies/${policy.id}/approve-step`).set(auth(approver)).send({ stepKey: "manager" }).expect(200)).body;
    expect(step.pendingApprovals).toEqual([]);

    // الآن الاعتماد المالي ينجح ⇒ ISSUED
    const fin = (await request(app.getHttpServer()).post(`/finance/policies/${policy.id}/approve`).set(auth(accountant)).expect(200)).body;
    expect(fin.status).toBe("ISSUED");
  });
});
