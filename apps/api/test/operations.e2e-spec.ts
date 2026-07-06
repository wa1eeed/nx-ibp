/**
 * اختبار الموديولز التشغيلية (تحقّق المرحلة 6): خدمة العملاء، المطالبات، التجديدات.
 * نفس نمط الحوكمة: RBAC + entitlement + عزل + تدقيق.
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

describe("الموديولز التشغيلية (e2e)", () => {
  let app: INestApplication;
  let care: string; // عناية العملاء (service ACED)
  let claimsOfficer: string; // مسؤول مطالبات (claims ACE)
  let sales: string; // مبيعات (لا service/claims/production)
  let underwriter: string; // production
  let amanGm: string; // الأمان basic (claims DISABLED)

  const login = async (email: string) =>
    (await request(app.getHttpServer()).post("/auth/login").send({ email, password: "Passw0rd!" })).body.accessToken as string;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    care = await login("nora@gulf-demo.sa");
    claimsOfficer = await login("fahad@gulf-demo.sa");
    sales = await login("sara@gulf-demo.sa");
    underwriter = await login("majed@gulf-demo.sa");
    amanGm = await login("omar@aman-demo.sa");
  });

  afterAll(async () => {
    await app?.close();
  });

  // ----- خدمة العملاء -----
  it("عناية العملاء تنشئ طلب خدمة ⇒ 201 برقم RQ", async () => {
    const res = await request(app.getHttpServer()).post("/service-requests").set(auth(care))
      .send({ clientId: "cl-fahd", type: "amendment", subject: "تعديل بيانات التابعين" }).expect(201);
    expect(res.body.sequenceNo).toMatch(/^RQ-/);
    expect(res.body.status).toBe("OPEN");
    const upd = await request(app.getHttpServer()).post(`/service-requests/${res.body.id}/status`).set(auth(care)).send({ status: "SENT_TO_INSURER" }).expect(200);
    expect(upd.body.status).toBe("SENT_TO_INSURER");
  });

  it("المبيعات لا تملك صلاحية خدمة العملاء ⇒ 403", () =>
    request(app.getHttpServer()).post("/service-requests").set(auth(sales)).send({ type: "inquiry" }).expect(403));

  // ----- المطالبات -----
  it("مسؤول المطالبات ينشئ مطالبة ويسوّيها ⇒ 201/200", async () => {
    const res = await request(app.getHttpServer()).post("/claims").set(auth(claimsOfficer))
      .send({ clientId: "cl-fahd", insurerName: "بوبا", claimedAmount: 25000, deductible: 500, incidentDate: "2026-05-10" }).expect(201);
    expect(res.body.sequenceNo).toMatch(/^CL-/);
    expect(res.body.status).toBe("RECEIVED");
    const settled = await request(app.getHttpServer()).post(`/claims/${res.body.id}/status`).set(auth(claimsOfficer)).send({ status: "SETTLED", settledAmount: 24500 }).expect(200);
    expect(settled.body.status).toBe("SETTLED");
    expect(Number(settled.body.settledAmount)).toBe(24500);
  });

  it("الأمان (basic) يصل للمطالبات — موديول أساسي تتطلّبه هيئة التأمين ⇒ 200", () =>
    request(app.getHttpServer()).get("/claims").set(auth(amanGm)).expect(200));

  // ----- التجديدات -----
  it("المكتتب يستعرض التجديدات المستحقّة ⇒ 200", () =>
    request(app.getHttpServer()).get("/renewals?days=60").set(auth(underwriter)).expect(200));

  it("المبيعات ممنوعة من التجديدات (production) ⇒ 403", () =>
    request(app.getHttpServer()).get("/renewals").set(auth(sales)).expect(403));

  it("بدء تجديد لوثيقة غير موجودة ⇒ 404", () =>
    request(app.getHttpServer()).post("/renewals/nonexistent/initiate").set(auth(underwriter)).expect(404));

  it("المكتتب يبدأ دورة تجديد ⇒ 201 طلب تأمين (DRAFT) مبني على الوثيقة، والتكرار ⇒ 409", async () => {
    const srv = app.getHttpServer();
    const due = (await request(srv).get("/renewals?days=120").set(auth(underwriter))).body as Array<{ id: string }>;
    expect(due.length).toBeGreaterThan(0);
    const policyId = due[0].id;
    const res = await request(srv).post(`/renewals/${policyId}/initiate`).set(auth(underwriter)).expect(201);
    expect(res.body.sequenceNo).toMatch(/^SL-/); // طلب تأمين جديد (لا مجرّد تذكرة RQ)
    expect(res.body.status).toBe("DRAFT");
    // منع التكرار: طلب تجديد قائم لنفس الوثيقة ⇒ 409
    await request(srv).post(`/renewals/${policyId}/initiate`).set(auth(underwriter)).expect(409);
  });

  // ----- العزل -----
  it("العزل: الأمان لا يرى طلبات خدمة الخليج", async () => {
    const res = await request(app.getHttpServer()).get("/service-requests").set(auth(amanGm)).expect(200);
    expect(res.body.every((s: { tenantId: string }) => s.tenantId === "demo-tenant-2")).toBe(true);
  });
});
