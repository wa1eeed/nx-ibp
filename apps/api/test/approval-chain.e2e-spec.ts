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
  let approver = "", nonApprover = "", dual = "";

  const login = async (email: string, password = "Passw0rd!") =>
    (await request(app.getHttpServer()).post("/auth/login").send({ email, password })).body.accessToken as string;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const perm = (module: string, canAccess: boolean, canEdit = false, canCreate = false) => ({ module, canAccess, canCreate, canEdit, canDelete: false });

  async function createAwardedRequest(): Promise<string> {
    const cr = String(Date.now()).slice(-8) + String(10 + Math.floor(Math.random() * 89));
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
    // مستخدم بدورين (إصدار + مالية) لاختبار فصل المهام
    const dEmail = `dual-${uniq}@gulf-demo.sa`;
    await request(app.getHttpServer()).post("/staff").set(auth(gm)).send({ fullName: "مزدوج", email: dEmail, password: "Passw0rd1", roleName: `مزدوج-${uniq}`, permissions: [perm("production", true, true, true), perm("finance", true, true, true)] }).expect(201);
    approver = await login(aEmail, "Passw0rd1");
    nonApprover = await login(nEmail, "Passw0rd1");
    dual = await login(dEmail, "Passw0rd1");
    // تهيئة السلسلة: خطوة مدير إضافية
    await request(app.getHttpServer()).put("/config/approval-chain").set(auth(gm)).send({ steps: [STEP] }).expect(200);
  });

  afterAll(async () => {
    // إعادة الضبط للافتراضي كي لا تتأثّر بقيّة الاختبارات
    if (gm) await request(app.getHttpServer()).put("/config/approval-chain").set(auth(gm)).send({ technicalGate: true, segregationOfDuties: true, steps: [] });
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

  it("تعطيل البوّابة الفنية ⇒ الإصدار يذهب مباشرة للاعتماد المالي", async () => {
    await request(app.getHttpServer()).put("/config/approval-chain").set(auth(gm)).send({ technicalGate: false, steps: [] }).expect(200);
    const requestId = await createAwardedRequest();
    const policy = (await request(app.getHttpServer()).post("/policies/issue").set(auth(underwriter)).send({ requestId, branchCode: "RUH", issuanceType: "POLICY" }).expect(201)).body;
    expect(policy.status).toBe("FINANCE_REVIEW"); // تخطّى TECHNICAL_REVIEW
    const fin = (await request(app.getHttpServer()).post(`/finance/policies/${policy.id}/approve`).set(auth(accountant)).expect(200)).body;
    expect(fin.status).toBe("ISSUED");
    // إعادة السلسلة الافتراضية للاختبار التالي
    await request(app.getHttpServer()).put("/config/approval-chain").set(auth(gm)).send({ technicalGate: true, steps: [STEP] }).expect(200);
  });

  it("فصل المهام: المُصدِر لا يعتمد وثيقته ماليًا (403)؛ وبتعطيله يُسمح", async () => {
    // بلا بوّابة فنية وبلا خطوات — تدفّق مبسّط لاختبار فصل المهام
    await request(app.getHttpServer()).put("/config/approval-chain").set(auth(gm)).send({ technicalGate: false, segregationOfDuties: true, steps: [] }).expect(200);
    const requestId = await createAwardedRequest();
    const policy = (await request(app.getHttpServer()).post("/policies/issue").set(auth(dual)).send({ requestId, branchCode: "RUH", issuanceType: "POLICY" }).expect(201)).body;
    // نفس المُصدِر يحاول الاعتماد المالي ⇒ 403 (فصل المهام)
    await request(app.getHttpServer()).post(`/finance/policies/${policy.id}/approve`).set(auth(dual)).expect(403);
    // معتمِد مالي مختلف ⇒ ينجح
    const fin = (await request(app.getHttpServer()).post(`/finance/policies/${policy.id}/approve`).set(auth(accountant)).expect(200)).body;
    expect(fin.status).toBe("ISSUED");

    // بتعطيل فصل المهام: يُسمح للمُصدِر باعتماد وثيقته
    await request(app.getHttpServer()).put("/config/approval-chain").set(auth(gm)).send({ technicalGate: false, segregationOfDuties: false, steps: [] }).expect(200);
    const rid2 = await createAwardedRequest();
    const p2 = (await request(app.getHttpServer()).post("/policies/issue").set(auth(dual)).send({ requestId: rid2, branchCode: "RUH", issuanceType: "POLICY" }).expect(201)).body;
    const fin2 = (await request(app.getHttpServer()).post(`/finance/policies/${p2.id}/approve`).set(auth(dual)).expect(200)).body;
    expect(fin2.status).toBe("ISSUED");
    // إعادة الافتراضي
    await request(app.getHttpServer()).put("/config/approval-chain").set(auth(gm)).send({ technicalGate: true, segregationOfDuties: true, steps: [STEP] }).expect(200);
  });

  it("§9.2 فصل المهام على البوّابة الفنية (مفعّل): مُصدِر الوثيقة لا يعتمدها فنيًا (403)، ومعتمِد آخر ينجح", async () => {
    // بوّابة فنية مفعّلة + فصل مهام فنّي، بلا خطوات إضافية
    await request(app.getHttpServer()).put("/config/approval-chain").set(auth(gm)).send({ technicalGate: true, technicalSegregation: true, steps: [] }).expect(200);
    const requestId = await createAwardedRequest();
    const policy = (await request(app.getHttpServer()).post("/policies/issue").set(auth(dual)).send({ requestId, branchCode: "RUH", issuanceType: "POLICY" }).expect(201)).body;
    expect(policy.status).toBe("TECHNICAL_REVIEW");
    // نفس المُصدِر (dual) يحاول الموافقة الفنية ⇒ 403 (فصل المهام الفني)
    await request(app.getHttpServer()).post(`/policies/${policy.id}/approve-technical`).set(auth(dual)).expect(403);
    // معتمِد فنّي مختلف (المكتتب) ⇒ 200 ⇒ للاعتماد المالي
    const tech = (await request(app.getHttpServer()).post(`/policies/${policy.id}/approve-technical`).set(auth(underwriter)).expect(200)).body;
    expect(tech.status).toBe("FINANCE_REVIEW");
    // ثم معتمِد مالي ثالث ⇒ ISSUED
    const fin = (await request(app.getHttpServer()).post(`/finance/policies/${policy.id}/approve`).set(auth(accountant)).expect(200)).body;
    expect(fin.status).toBe("ISSUED");
  });

  it("§9.2 فصل المهام الفني (مُعطَّل افتراضيًا): المُصدِر يعتمد وثيقته فنيًا — توافق رجعي", async () => {
    await request(app.getHttpServer()).put("/config/approval-chain").set(auth(gm)).send({ technicalGate: true, technicalSegregation: false, steps: [] }).expect(200);
    const requestId = await createAwardedRequest();
    const policy = (await request(app.getHttpServer()).post("/policies/issue").set(auth(dual)).send({ requestId, branchCode: "RUH", issuanceType: "POLICY" }).expect(201)).body;
    // نفس المُصدِر يعتمدها فنيًا ⇒ 200 (السلوك الافتراضي — لا يُفرض الفصل الفني إلا بتفعيله)
    const tech = (await request(app.getHttpServer()).post(`/policies/${policy.id}/approve-technical`).set(auth(dual)).expect(200)).body;
    expect(tech.status).toBe("FINANCE_REVIEW");
    // إعادة الافتراضي (فصل فنّي مُعطَّل + السلسلة الافتراضية)
    await request(app.getHttpServer()).put("/config/approval-chain").set(auth(gm)).send({ technicalGate: true, segregationOfDuties: true, technicalSegregation: false, steps: [STEP] }).expect(200);
  });
});
