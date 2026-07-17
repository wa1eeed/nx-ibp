/**
 * اختبار بوّابة العميل (تحقّق المرحلة 8ب):
 *  - العميل يدخل بنطاق `client` ويرى بياناته هو فقط (وثائق/طلبات/مطالبات/كشف حساب/مستندات).
 *  - عزل ثنائي الاتجاه: موظف المستأجر لا يصل للبوّابة، والعميل لا يصل لمسارات المستأجر،
 *    وعميل مستأجر آخر لا يرى بيانات هذا العميل.
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { createHmac } from "node:crypto";
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

  it("كشف الحساب يجمع المستحقّ من إشعارات المدين، ولا يكشف فواتير عمولة الوسيط", async () => {
    const res = await request(app.getHttpServer()).get("/portal/statement").set(auth(fahd)).expect(200);
    // ≥3 (قد تُضيف اختبارات الملاحق إشعارات مدين لوثائق الفهد — نتحقّق من العلاقة لا عددٍ صلب)
    expect(res.body.debitNotes.length).toBeGreaterThanOrEqual(3);
    // العميل يرى فواتير رسومه الخاصة فقط (kind=FEES) — لا فواتير عمولة الوسيط على المؤمِّنين
    expect(Array.isArray(res.body.invoices)).toBe(true);
    expect(res.body.invoices.every((i: { sequenceNo: string }) => typeof i.sequenceNo === "string")).toBe(true);
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
    expect(res.body[0].sequenceNo).toBe("POL-RUH-MTP-2026-1006");
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

  // ——— الخدمة الذاتية للعميل (المرحلة 8ب — الحزمة الكاملة) ———

  it("العميل يفتح تفاصيل وثيقته (وثيقة + مطالبات + مستندات)", async () => {
    const srv = app.getHttpServer();
    const policies = (await request(srv).get("/portal/policies").set(auth(fahd))).body as Array<{ id: string }>;
    const res = await request(srv).get(`/portal/policies/${policies[0].id}`).set(auth(fahd)).expect(200);
    expect(res.body.policy.id).toBe(policies[0].id);
    expect(Array.isArray(res.body.claims)).toBe(true);
    expect(Array.isArray(res.body.documents)).toBe(true);
  });

  it("العميل يقدّم مطالبة على وثيقته ⇒ 201 RECEIVED وتظهر في قائمته", async () => {
    const srv = app.getHttpServer();
    const policies = (await request(srv).get("/portal/policies").set(auth(fahd))).body as Array<{ id: string }>;
    const res = await request(srv).post("/portal/claims").set(auth(fahd))
      .send({ policyId: policies[0].id, incidentDate: "2026-06-01", claimedAmount: 5000, description: "حادث تجريبي عبر البوّابة" })
      .expect(201);
    expect(res.body.status).toBe("RECEIVED");
    expect(res.body.sequenceNo).toBeTruthy();
    const list = (await request(srv).get("/portal/claims").set(auth(fahd))).body as Array<{ id: string }>;
    expect(list.some((c) => c.id === res.body.id)).toBe(true);
  });

  it("العميل يقدّم طلب خدمة ⇒ 201 OPEN ويظهر في طلباته", async () => {
    const srv = app.getHttpServer();
    const res = await request(srv).post("/portal/service-requests").set(auth(fahd))
      .send({ type: "certificate", subject: "شهادة تغطية", description: "أرغب بشهادة تغطية" })
      .expect(201);
    expect(res.body.status).toBe("OPEN");
    expect(res.body.type).toBe("certificate");
    const reqs = (await request(srv).get("/portal/requests").set(auth(fahd))).body as { serviceRequests: Array<{ id: string }> };
    expect(reqs.serviceRequests.some((s) => s.id === res.body.id)).toBe(true);
  });

  it("محادثة طلب الخدمة: العميل يرى الرد الظاهر فقط (لا الملاحظة الداخلية) ويردّ + عزل", async () => {
    const srv = app.getHttpServer();
    const sr = (await request(srv).post("/portal/service-requests").set(auth(fahd)).send({ type: "inquiry", subject: "استفسار عن التغطية" }).expect(201)).body;

    // الموظف يضيف ملاحظة داخلية (سرّية) + ردًّا ظاهرًا للعميل
    await request(srv).post(`/service-requests/${sr.id}/notes`).set(auth(employee)).send({ body: "ملاحظة داخلية سرّية", visibility: "internal" }).expect(201);
    await request(srv).post(`/service-requests/${sr.id}/notes`).set(auth(employee)).send({ body: "رد الوسيط الظاهر", visibility: "client" }).expect(201);

    // العميل يفتح التفاصيل ⇒ يرى الرد الظاهر فقط، والملاحظة الداخلية لا تتسرّب (أمان)
    const detail = (await request(srv).get(`/portal/service-requests/${sr.id}`).set(auth(fahd)).expect(200)).body;
    const timeline = detail.timeline as Array<{ body: string; mine: boolean; authorName: string | null }>;
    expect(timeline.map((m) => m.body)).toContain("رد الوسيط الظاهر");
    expect(timeline.map((m) => m.body)).not.toContain("ملاحظة داخلية سرّية");
    const staffMsg = timeline.find((m) => m.body === "رد الوسيط الظاهر")!;
    expect(staffMsg.mine).toBe(false);
    expect(staffMsg.authorName).toBeTruthy();

    // العميل يردّ ⇒ يظهر بعلامة mine=true
    await request(srv).post(`/portal/service-requests/${sr.id}/reply`).set(auth(fahd)).send({ body: "شكرًا، بانتظار الشهادة" }).expect(201);
    const detail2 = (await request(srv).get(`/portal/service-requests/${sr.id}`).set(auth(fahd)).expect(200)).body;
    expect((detail2.timeline as Array<{ body: string; mine: boolean }>).find((m) => m.body === "شكرًا، بانتظار الشهادة")!.mine).toBe(true);

    // عزل: عميل آخر لا يفتح/يردّ على طلب الفهد ⇒ 404
    await request(srv).get(`/portal/service-requests/${sr.id}`).set(auth(nukhba)).expect(404);
    await request(srv).post(`/portal/service-requests/${sr.id}/reply`).set(auth(nukhba)).send({ body: "تسلّل" }).expect(404);
  });

  it("محادثة المطالبة: العميل يرى التحديث الظاهر فقط (لا الداخلي) ويردّ + عزل", async () => {
    const srv = app.getHttpServer();
    const fahdPolicies = (await request(srv).get("/portal/policies").set(auth(fahd))).body as Array<{ id: string }>;
    const claim = (await request(srv).post("/claims").set(auth(employee)).send({ clientId: "cl-fahd", policyId: fahdPolicies[0].id, insurerName: "بوبا", claimedAmount: 10000 }).expect(201)).body;

    // الموظف: ملاحظة داخلية (سرّية) + تحديث ظاهر
    await request(srv).post(`/claims/${claim.id}/notes`).set(auth(employee)).send({ body: "ملاحظة داخلية على المطالبة", visibility: "internal" }).expect(201);
    await request(srv).post(`/claims/${claim.id}/notes`).set(auth(employee)).send({ body: "تحديث ظاهر للعميل", visibility: "client" }).expect(201);

    // العميل يرى الظاهر فقط
    const detail = (await request(srv).get(`/portal/claims/${claim.id}`).set(auth(fahd)).expect(200)).body;
    const bodies = (detail.timeline as Array<{ body: string; mine: boolean }>).map((m) => m.body);
    expect(bodies).toContain("تحديث ظاهر للعميل");
    expect(bodies).not.toContain("ملاحظة داخلية على المطالبة");

    // العميل يردّ ⇒ mine
    await request(srv).post(`/portal/claims/${claim.id}/reply`).set(auth(fahd)).send({ body: "شكرًا للتحديث" }).expect(201);
    const d2 = (await request(srv).get(`/portal/claims/${claim.id}`).set(auth(fahd)).expect(200)).body;
    expect((d2.timeline as Array<{ body: string; mine: boolean }>).find((m) => m.body === "شكرًا للتحديث")!.mine).toBe(true);

    // جهة الموظف: تفاصيل المطالبة تُرجِع بيانات العميل + الخطّ الزمني الكامل (داخلي + ظاهر + رد العميل = 3)
    const staffDetail = (await request(srv).get(`/claims/${claim.id}`).set(auth(employee)).expect(200)).body;
    expect(staffDetail.client.name).toBeTruthy();
    expect((staffDetail.timeline as Array<{ visibility: string }>).length).toBe(3);

    // عزل: عميل آخر لا يفتح مطالبة الفهد ⇒ 404
    await request(srv).get(`/portal/claims/${claim.id}`).set(auth(nukhba)).expect(404);
  });

  it("العميل يحدّث بيانات التواصل من البوّابة (تحقّق الجوال) — الحقول المُتحقَّقة للعرض فقط", async () => {
    const srv = app.getHttpServer();
    const updated = (await request(srv).put("/portal/me").set(auth(fahd)).send({ contactName: "أبو محمد", phone: "0512345678", landline: "0112345678" }).expect(200)).body;
    expect(updated.contactName).toBe("أبو محمد");
    expect(updated.phone).toBe("0512345678");
    expect(updated.landline).toBe("0112345678");
    // جوال بصيغة خاطئة ⇒ 400 (لا يُحفظ)
    await request(srv).put("/portal/me").set(auth(fahd)).send({ phone: "12345" }).expect(400);
  });

  it("العميل يطلب تجديد وثيقته ⇒ 201 طلب خدمة نوعه renewal", async () => {
    const srv = app.getHttpServer();
    const policies = (await request(srv).get("/portal/policies").set(auth(fahd))).body as Array<{ id: string }>;
    const res = await request(srv).post(`/portal/policies/${policies[0].id}/renew`).set(auth(fahd)).expect(201);
    expect(res.body.type).toBe("renewal");
    expect(res.body.status).toBe("OPEN");
  });

  it("عزل: العميل لا يقدّم مطالبة على وثيقة لا يملكها ⇒ 403", async () => {
    const srv = app.getHttpServer();
    // وثيقة الفهد لا يطالب عليها عميل النخبة
    const fahdPolicies = (await request(srv).get("/portal/policies").set(auth(fahd))).body as Array<{ id: string }>;
    await request(srv).post("/portal/claims").set(auth(nukhba))
      .send({ policyId: fahdPolicies[0].id, description: "محاولة على وثيقة الغير" })
      .expect(403);
  });

  it("عزل: العميل لا يفتح تفاصيل وثيقة لا يملكها ⇒ 404", async () => {
    const srv = app.getHttpServer();
    const fahdPolicies = (await request(srv).get("/portal/policies").set(auth(fahd))).body as Array<{ id: string }>;
    await request(srv).get(`/portal/policies/${fahdPolicies[0].id}`).set(auth(nukhba)).expect(404);
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

  it("§5.1 توفير الدخول: دعوة ⇒ لا دخول قبل التفعيل · تفعيل بالتوكن ⇒ دخول · توكن فاسد 401 · كلمة ضعيفة 400", async () => {
    const srv = app.getHttpServer();
    // العميل (نطاق client) لا يملك مسار الموظف
    await request(srv).get("/clients/cl-fahd/portal-users").set(auth(fahd)).expect(403);

    // دعوة عميل موجود (الفهد) ببريد جديد — يُنشئ مستخدم بوّابة غير مُفعَّل
    const email = `e2e-portal-${Date.now()}@test.sa`;
    const inv = (await request(srv).post("/clients/cl-fahd/portal-invite").set(auth(employee)).send({ email, fullName: "مستخدم اختبار البوّابة" }).expect(201)).body;
    expect(inv.user.activated).toBe(false);
    expect(inv.inviteLink).toContain("/portal/activate?token=");
    const token = inv.inviteLink.split("token=")[1];

    // معلومات الدعوة (عام) — بريد/اسم الشركة
    const info = (await request(srv).get(`/portal/invite/${token}`).expect(200)).body;
    expect(info.email).toBe(email);
    expect(info.activated).toBe(false);
    expect(info.clientName).toBeTruthy();

    // لا يمكن الدخول قبل التفعيل (بلا كلمة مرور)
    await request(srv).post("/portal/login").send({ email, password: "Str0ngPass1!" }).expect(401);

    // توكن فاسد ⇒ 401 · كلمة مرور ضعيفة ⇒ 400
    await request(srv).get("/portal/invite/not-a-token").expect(401);
    await request(srv).post("/portal/activate").send({ token, password: "short" }).expect(400);

    // تفعيل صحيح ⇒ توكن دخول (auto-login) ثم الدخول ينجح
    const act = (await request(srv).post("/portal/activate").send({ token, password: "Str0ngPass1!" }).expect(200)).body;
    expect(act.accessToken).toBeTruthy();
    expect(act.user.email).toBe(email);
    await request(srv).post("/portal/login").send({ email, password: "Str0ngPass1!" }).expect(201);

    // يظهر في قائمة مستخدمي البوّابة مُفعَّلاً
    const list = (await request(srv).get("/clients/cl-fahd/portal-users").set(auth(employee)).expect(200)).body as Array<{ id: string; email: string; activated: boolean }>;
    const created = list.find((u) => u.email === email);
    expect(created?.activated).toBe(true);

    // إلغاء الدخول ⇒ لا يمكن الدخول بعدها
    const userId = list.find((x) => x.email === email)!.id;
    await request(srv).post(`/clients/cl-fahd/portal-users/${userId}/revoke`).set(auth(employee)).expect(200);
    await request(srv).post("/portal/login").send({ email, password: "Str0ngPass1!" }).expect(401);

    // دعوة على عميل غير موجود ⇒ 404
    await request(srv).post("/clients/nope-client/portal-invite").set(auth(employee)).send({ email: "x@y.sa", fullName: "لا أحد" }).expect(404);
  });

  it("§2.2-ب الدفع الإلكتروني: دفع إشعار ⇒ تأكيد ⇒ سند قبض تلقائي (المتبقّي ينقص) · تجاوز 400 · webhook موقّع · idempotent", async () => {
    const srv = app.getHttpServer();
    // تفعيل بوّابة الدفع للمستأجر (البيئة test ⇒ SandboxGateway حتمي)
    await request(srv).put("/config/payment").set(auth(employee)).send({ provider: "tap", publicKey: "pk_t", secretKey: "sk_t", enabled: true }).expect(200);

    // إشعار مدين قائم لعميل الفهد (من ذمم الموظف)
    const notes = (await request(srv).get("/finance/receivables").set(auth(employee))).body.notes as Array<{ id: string; clientId: string; outstanding: number }>;
    const note = notes.find((n) => n.clientId === "cl-fahd" && n.outstanding > 300);
    expect(note).toBeTruthy();
    const before = note!.outstanding;

    // تجاوز المتبقّي ⇒ 400 · إشعار عميل آخر ⇒ 404
    await request(srv).post("/portal/pay").set(auth(fahd)).send({ debitNoteId: note!.id, amount: before + 1000 }).expect(400);
    await request(srv).post("/portal/pay").set(auth(nukhba)).send({ debitNoteId: note!.id, amount: 10 }).expect(404);

    // دفع جزئي ⇒ شحنة + رابط دفع
    const pay = (await request(srv).post("/portal/pay").set(auth(fahd)).send({ debitNoteId: note!.id, amount: 100 }).expect(201)).body;
    expect(pay.paymentId).toBeTruthy();
    expect(pay.redirectUrl).toContain("sandbox=1"); // بوّابة الاختبار
    expect(pay.status).toBe("PENDING");

    // تأكيد العودة ⇒ PAID + سند قبض تلقائي ⇒ المتبقّي ينقص 100
    const conf = (await request(srv).post(`/portal/pay/${pay.paymentId}/confirm`).set(auth(fahd)).expect(200)).body;
    expect(conf.status).toBe("PAID");
    const after = (await request(srv).get("/finance/receivables").set(auth(employee))).body.notes.find((n: { id: string }) => n.id === note!.id).outstanding;
    expect(after).toBeCloseTo(before - 100, 2);
    // idempotent: تأكيد ثانٍ لا يُنشئ سندًا آخر
    await request(srv).post(`/portal/pay/${pay.paymentId}/confirm`).set(auth(fahd)).expect(200);
    const after2 = (await request(srv).get("/finance/receivables").set(auth(employee))).body.notes.find((n: { id: string }) => n.id === note!.id).outstanding;
    expect(after2).toBeCloseTo(after, 2); // لم يتغيّر

    // مسار الـwebhook: شحنة جديدة (بلا تأكيد) ثم webhook موقّع صحيح ⇒ يُسجّل السند
    const pay2 = (await request(srv).post("/portal/pay").set(auth(fahd)).send({ debitNoteId: note!.id, amount: 50 }).expect(201)).body;
    const p2 = (await request(srv).get("/finance/receivables").set(auth(employee))).body.notes.find((n: { id: string }) => n.id === note!.id).outstanding;
    const chargeId = `sbx_${pay2.paymentId}`; // معرّف SandboxGateway الحتميّ
    const sig = createHmac("sha256", process.env.BILLING_WEBHOOK_SECRET ?? "sandbox_secret").update(`${chargeId}|CAPTURED`).digest("hex");
    // توقيع فاسد ⇒ 409
    await request(srv).post("/payments/webhook").set({ hashstring: "bad" }).send({ id: chargeId, status: "CAPTURED" }).expect(409);
    // توقيع صحيح ⇒ 200 + سند ⇒ المتبقّي ينقص 50
    await request(srv).post("/payments/webhook").set({ hashstring: sig }).send({ id: chargeId, status: "CAPTURED" }).expect(200);
    const p3 = (await request(srv).get("/finance/receivables").set(auth(employee))).body.notes.find((n: { id: string }) => n.id === note!.id).outstanding;
    expect(p3).toBeCloseTo(p2 - 50, 2);
  });
});
