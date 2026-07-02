/**
 * اختبار بوّابة العميل (تحقّق المرحلة 8ب):
 *  - العميل يدخل بنطاق `client` ويرى بياناته هو فقط (وثائق/طلبات/مطالبات/كشف حساب/مستندات).
 *  - عزل ثنائي الاتجاه: موظف المستأجر لا يصل للبوّابة، والعميل لا يصل لمسارات المستأجر،
 *    وعميل مستأجر آخر لا يرى بيانات هذا العميل.
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

describe("بوّابة العميل (e2e)", () => {
  let app: INestApplication;
  let fahd: string; // عميل (الفهد) — demo-tenant
  let nukhba: string; // عميل (النخبة) — demo-tenant-2
  let employee: string; // موظف مستأجر

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    const srv = app.getHttpServer();
    fahd = (await request(srv).post("/portal/login").send({ email: "portal@alfahd.sa", password: "Passw0rd!" })).body.accessToken;
    nukhba = (await request(srv).post("/portal/login").send({ email: "portal@nukhba.sa", password: "Passw0rd!" })).body.accessToken;
    employee = (await request(srv).post("/auth/login").send({ email: "waleed@gulf-demo.sa", password: "Passw0rd!" })).body.accessToken;
  });

  afterAll(async () => {
    await app?.close();
  });

  it("دخول العميل يُصدر توكناً", () => expect(fahd).toBeTruthy());

  it("كلمة مرور خاطئة ⇒ 401", () =>
    request(app.getHttpServer()).post("/portal/login").send({ email: "portal@alfahd.sa", password: "wrong" }).expect(401));

  it("العميل يرى ملفه الشخصي", async () => {
    const res = await request(app.getHttpServer()).get("/portal/me").set(auth(fahd)).expect(200);
    expect(res.body.name).toContain("الفهد");
    expect(res.body.complianceStatus).toBe("APPROVED");
  });

  it("العميل يرى وثائقه (3 وثائق سارية)", async () => {
    const res = await request(app.getHttpServer()).get("/portal/policies").set(auth(fahd)).expect(200);
    expect(res.body.length).toBe(3);
    expect(res.body.every((p: { status: string }) => p.status === "ISSUED")).toBe(true);
  });

  it("العميل يرى مطالباته فقط", async () => {
    const res = await request(app.getHttpServer()).get("/portal/claims").set(auth(fahd)).expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    expect(res.body.map((c: { sequenceNo: string }) => c.sequenceNo)).toEqual(expect.arrayContaining(["CL-RUH-2026-0001", "CL-RUH-2026-0002"]));
  });

  it("كشف الحساب يجمع المستحقّ من إشعارات المدين", async () => {
    const res = await request(app.getHttpServer()).get("/portal/statement").set(auth(fahd)).expect(200);
    expect(res.body.debitNotes.length).toBe(3);
    expect(res.body.invoices.length).toBe(3);
    expect(res.body.outstanding).toBeGreaterThan(0);
  });

  it("المستندات تشمل وثائق العميل ومطالباته (عبر رابط موقّت)", async () => {
    const res = await request(app.getHttpServer()).get("/portal/documents").set(auth(fahd)).expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(3); // جدول الطبي + شهادة المركبات + نموذج المطالبة + السجل
    const docId = res.body[0].id;
    const url = await request(app.getHttpServer()).get(`/portal/documents/${docId}/url`).set(auth(fahd)).expect(200);
    expect(url.body.view.url).toBeTruthy();
  });

  it("عزل: عميل مستأجر آخر (النخبة) لا يرى وثائق الفهد", async () => {
    const res = await request(app.getHttpServer()).get("/portal/policies").set(auth(nukhba)).expect(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].sequenceNo).toBe("POL-RUH-MTP-2026-1005");
  });

  it("عزل: موظف المستأجر ممنوع من البوّابة ⇒ 403", () =>
    request(app.getHttpServer()).get("/portal/policies").set(auth(employee)).expect(403));

  it("عزل: العميل ممنوع من مسارات المستأجر ⇒ 403", () =>
    request(app.getHttpServer()).get("/clients").set(auth(fahd)).expect(403));

  it("عزل: لا يمكن للعميل فتح رابط مستند لا يملكه ⇒ 404", async () => {
    // مستند الفهد لا يُفتح بتوكن النخبة
    const fahdDocs = await request(app.getHttpServer()).get("/portal/documents").set(auth(fahd));
    const someId = fahdDocs.body[0].id;
    await request(app.getHttpServer()).get(`/portal/documents/${someId}/url`).set(auth(nukhba)).expect(404);
  });

  it("إشعار داخل المنصة للعميل: حدث من الوسيط يظهر في بوّابة العميل + عزل + تعليم مقروء", async () => {
    const srv = app.getHttpServer();
    // الوسيط (نفس المستأجر) ينشئ طلب خدمة للعميل cl-fahd ⇒ يُطلق request_ack (نسخة داخل المنصة للعميل)
    await request(srv).post("/service-requests").set(auth(employee)).send({ clientId: "cl-fahd", type: "inquiry", subject: "استفسار تجريبي" }).expect(201);
    // العميل يرى الإشعار في بوّابته (fire-and-forget ⇒ استطلاع قصير)
    let inbox: Array<{ id: string; eventKey: string; readAt: string | null }> = [];
    for (let i = 0; i < 25 && !inbox.some((n) => n.eventKey === "request_ack"); i++) {
      inbox = (await request(srv).get("/portal/notifications").set(auth(fahd))).body;
      if (!inbox.some((n) => n.eventKey === "request_ack")) await new Promise((r) => setTimeout(r, 50));
    }
    const notif = inbox.find((n) => n.eventKey === "request_ack");
    expect(notif).toBeTruthy();
    expect(notif!.readAt).toBeNull();
    // عزل: عميل آخر (النخبة) لا يرى إشعار الفهد
    const other = (await request(srv).get("/portal/notifications").set(auth(nukhba))).body as Array<{ id: string }>;
    expect(other.every((n) => n.id !== notif!.id)).toBe(true);
    // تعليم كمقروء
    await request(srv).post(`/portal/notifications/${notif!.id}/read`).set(auth(fahd)).expect(200);
    const after = (await request(srv).get("/portal/notifications/unread-count").set(auth(fahd))).body;
    expect(after.count).toBeGreaterThanOrEqual(0);
  });
});
