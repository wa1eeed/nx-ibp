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

  it("تطوير الخدمة: إسناد لموظف + أولوية + ملاحظة ⇒ خطّ زمني في التفاصيل", async () => {
    const srv = app.getHttpServer();
    // موظّفون قابلون للإسناد (بحارس service:read) — المبيعات ممنوعة
    await request(srv).get("/service-requests/staff").set(auth(sales)).expect(403);
    const staff = (await request(srv).get("/service-requests/staff").set(auth(care)).expect(200)).body as Array<{ id: string; fullName: string }>;
    expect(staff.length).toBeGreaterThan(0);
    const target = staff[0].id;

    const sr = (await request(srv).post("/service-requests").set(auth(care)).send({ type: "amendment", subject: "طلب متطوّر", priority: "high" }).expect(201)).body;
    expect(sr.priority).toBe("high");

    const asg = (await request(srv).post(`/service-requests/${sr.id}/assign`).set(auth(care)).send({ assigneeId: target }).expect(200)).body;
    expect(asg.assigneeId).toBe(target);
    expect(asg.assigneeName).toBeTruthy();

    const pr = (await request(srv).post(`/service-requests/${sr.id}/priority`).set(auth(care)).send({ priority: "urgent" }).expect(200)).body;
    expect(pr.priority).toBe("urgent");

    await request(srv).post(`/service-requests/${sr.id}/notes`).set(auth(care)).send({ body: "اتصلت بالمؤمِّن وبانتظار الرد" }).expect(201);

    const detail = (await request(srv).get(`/service-requests/${sr.id}`).set(auth(care)).expect(200)).body;
    expect(detail.assigneeName).toBeTruthy();
    expect(detail.priority).toBe("urgent");
    expect(detail.timeline.length).toBeGreaterThanOrEqual(3); // إنشاء + إسناد + أولوية + ملاحظة
    // الملاحظة الداخلية: visibility=internal + اسم الكاتب مُرفق في الخطّ الزمني
    const note = (detail.timeline as Array<{ body: string; visibility: string; authorName: string | null }>).find((a) => a.body.includes("اتصلت بالمؤمِّن"));
    expect(note).toBeTruthy();
    expect(note!.visibility).toBe("internal");
    expect(note!.authorName).toBeTruthy();

    // رد ظاهر للعميل: visibility=client + type=reply (يظهر في بوّابة العميل ويُشعِره)
    await request(srv).post(`/service-requests/${sr.id}/notes`).set(auth(care)).send({ body: "رد يظهر للعميل", visibility: "client" }).expect(201);
    const detail2 = (await request(srv).get(`/service-requests/${sr.id}`).set(auth(care)).expect(200)).body;
    const reply = (detail2.timeline as Array<{ body: string; visibility: string; type: string }>).find((a) => a.body === "رد يظهر للعميل");
    expect(reply).toBeTruthy();
    expect(reply!.visibility).toBe("client");
    expect(reply!.type).toBe("reply");

    // فلترة بالحالة تعمل
    const open = (await request(srv).get("/service-requests?status=OPEN").set(auth(care)).expect(200)).body as Array<{ status: string }>;
    expect(open.every((r) => r.status === "OPEN")).toBe(true);
  });

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
    // اختر أول وثيقة قابلة للتجديد فعلًا — قد يكون لبعض الوثائق طلب تجديد قائم مسبقًا
    // (بيانات عرض واقعية أو تشغيل سابق للاختبار)؛ نتخطّاها ونتحقّق أنها تُرفض بـ409.
    let created: { body: { sequenceNo?: string; status?: string } } | null = null;
    let policyId = "";
    for (const d of due) {
      const r = await request(srv).post(`/renewals/${d.id}/initiate`).set(auth(underwriter));
      if (r.status === 201) { created = r; policyId = d.id; break; }
      expect(r.status).toBe(409); // الحالة الوحيدة المقبولة عدا 201: «طلب تجديد قائم»
    }
    expect(created).not.toBeNull();
    expect(created!.body.sequenceNo).toMatch(/^SL-/); // طلب تأمين جديد (لا مجرّد تذكرة RQ)
    expect(created!.body.status).toBe("DRAFT");
    // منع التكرار: إعادة بدء التجديد لنفس الوثيقة ⇒ 409
    await request(srv).post(`/renewals/${policyId}/initiate`).set(auth(underwriter)).expect(409);
  });

  // ----- العزل -----
  it("العزل: الأمان لا يرى طلبات خدمة الخليج", async () => {
    const res = await request(app.getHttpServer()).get("/service-requests").set(auth(amanGm)).expect(200);
    expect(res.body.every((s: { tenantId: string }) => s.tenantId === "demo-tenant-2")).toBe(true);
  });
});
