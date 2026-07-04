/**
 * اختبار CRM (E5) — تحقّق:
 *  - صفقة: إنشاء (مرحلة new) + إثراء باسم العميل/المُسنَد + نقل مرحلة يُسجَّل كنشاط.
 *  - مهمة: إنشاء بإسناد ⇒ إشعار داخل المنصة للمُسنَد إليه + إكمال.
 *  - نشاط/ملاحظة: إضافة وقراءة الخط الزمني.
 *  - عزل صلاحية: بلا وحدة المبيعات ⇒ 403.
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

describe("CRM — E5 (e2e)", () => {
  let app: INestApplication;
  let gm: string; // مدير عام (له sales)
  let assigneeId = "", assigneeToken = "", noSales = "";

  const login = async (email: string, password = "Passw0rd!") =>
    (await request(app.getHttpServer()).post("/auth/login").send({ email, password })).body.accessToken as string;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const perm = (module: string, canAccess: boolean, canCreate = false) => ({ module, canAccess, canCreate, canEdit: false, canDelete: false, canRevert: false });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    gm = await login("waleed@gulf-demo.sa");
    const uniq = String(Date.now()).slice(-8);
    const aEmail = `crm-assignee-${uniq}@gulf-demo.sa`, nEmail = `crm-nosales-${uniq}@gulf-demo.sa`;
    const a = await request(app.getHttpServer()).post("/staff").set(auth(gm)).send({ fullName: "مُسنَد إليه", email: aEmail, password: "Passw0rd1", roleName: `مبيعات-${uniq}`, permissions: [perm("sales", true, true)] }).expect(201);
    assigneeId = a.body.id;
    await request(app.getHttpServer()).post("/staff").set(auth(gm)).send({ fullName: "بلا مبيعات", email: nEmail, password: "Passw0rd1", roleName: `لوحة-${uniq}`, permissions: [perm("dashboard", true)] }).expect(201);
    assigneeToken = await login(aEmail, "Passw0rd1");
    noSales = await login(nEmail, "Passw0rd1");
  });

  afterAll(async () => { await app?.close(); });

  it("صفقة: إنشاء ونقل مرحلة يُسجَّل كنشاط + إثراء باسم العميل", async () => {
    const deal = (await request(app.getHttpServer()).post("/crm/deals").set(auth(gm)).send({ title: "تأمين أسطول جديد", clientId: "cl-naseej", value: 250000, productLineCode: "MCI" }).expect(201)).body;
    expect(deal.stage).toBe("new");

    const list = (await request(app.getHttpServer()).get("/crm/deals").set(auth(gm)).expect(200)).body as Array<{ id: string; clientName: string | null }>;
    const mine = list.find((d) => d.id === deal.id);
    expect(mine?.clientName).toBe("مجموعة نسيج القابضة"); // إثراء

    await request(app.getHttpServer()).patch(`/crm/deals/${deal.id}`).set(auth(gm)).send({ stage: "quoting" }).expect(200);
    const acts = (await request(app.getHttpServer()).get(`/crm/activities/deal/${deal.id}`).set(auth(gm)).expect(200)).body as Array<{ type: string }>;
    expect(acts.some((a) => a.type === "stage_change")).toBe(true);
  });

  it("مهمة: إسناد ⇒ إشعار داخل المنصة للمُسنَد إليه + إكمال", async () => {
    const before = (await request(app.getHttpServer()).get("/notifications/inbox/unread-count").set(auth(assigneeToken)).expect(200)).body.count;
    const task = (await request(app.getHttpServer()).post("/crm/tasks").set(auth(gm)).send({ title: "الاتصال بالعميل لمتابعة العرض", assigneeId, priority: "high", dueDate: "2026-08-01" }).expect(201)).body;
    // المُسنَد إليه يرى مهامه + وصله إشعار
    let inbox: Array<{ eventKey: string }> = [];
    for (let i = 0; i < 25 && !inbox.some((n) => n.eventKey === "staff_task_assigned"); i++) {
      inbox = (await request(app.getHttpServer()).get("/notifications/inbox").set(auth(assigneeToken))).body;
      if (!inbox.some((n) => n.eventKey === "staff_task_assigned")) await new Promise((r) => setTimeout(r, 40));
    }
    expect(inbox.some((n) => n.eventKey === "staff_task_assigned")).toBe(true);
    const after = (await request(app.getHttpServer()).get("/notifications/inbox/unread-count").set(auth(assigneeToken)).expect(200)).body.count;
    expect(after).toBeGreaterThan(before);

    const myTasks = (await request(app.getHttpServer()).get("/crm/tasks?mine=1").set(auth(assigneeToken)).expect(200)).body as Array<{ id: string }>;
    expect(myTasks.some((x) => x.id === task.id)).toBe(true);
    await request(app.getHttpServer()).post(`/crm/tasks/${task.id}/complete`).set(auth(gm)).expect(201);
  });

  it("ملاحظة: إضافة وقراءة الخط الزمني", async () => {
    const deal = (await request(app.getHttpServer()).post("/crm/deals").set(auth(gm)).send({ title: "صفقة ملاحظات" }).expect(201)).body;
    await request(app.getHttpServer()).post("/crm/activities").set(auth(gm)).send({ entityType: "deal", entityId: deal.id, type: "call", body: "اتصلت بالعميل ووافق مبدئيًا" }).expect(201);
    const acts = (await request(app.getHttpServer()).get(`/crm/activities/deal/${deal.id}`).set(auth(gm)).expect(200)).body as Array<{ body: string }>;
    expect(acts.some((a) => a.body.includes("اتصلت بالعميل"))).toBe(true);
  });

  it("رؤية حسب الدور: المندوب يرى صفقاته فقط لا صفقات غيره، ولا يعدّلها", async () => {
    // assigneeToken = مندوب مبيعات (sales بلا حذف) ⇒ ليس مديرًا
    const mine = (await request(app.getHttpServer()).post("/crm/deals").set(auth(gm)).send({ title: "صفقة المندوب", assigneeId }).expect(201)).body;
    const other = (await request(app.getHttpServer()).post("/crm/deals").set(auth(gm)).send({ title: "صفقة غير مُسنَدة" }).expect(201)).body; // أنشأها المدير، بلا إسناد

    const repDeals = (await request(app.getHttpServer()).get("/crm/deals").set(auth(assigneeToken)).expect(200)).body as Array<{ id: string }>;
    expect(repDeals.some((d) => d.id === mine.id)).toBe(true);   // يرى المُسنَدة إليه
    expect(repDeals.some((d) => d.id === other.id)).toBe(false); // لا يرى صفقة غيره

    const gmDeals = (await request(app.getHttpServer()).get("/crm/deals").set(auth(gm)).expect(200)).body as Array<{ id: string }>;
    expect(gmDeals.some((d) => d.id === other.id)).toBe(true);   // المدير يرى الكل

    // المندوب لا يعدّل صفقة غيره ⇒ 403
    await request(app.getHttpServer()).patch(`/crm/deals/${other.id}`).set(auth(assigneeToken)).send({ stage: "quoting" }).expect(403);
  });

  it("لوحة المتابعة تحترم الصلاحيات: المدير يرى المطالبات/العمولات، والمندوب لا", async () => {
    const gmFu = (await request(app.getHttpServer()).get("/crm/follow-up").set(auth(gm)).expect(200)).body;
    expect(typeof gmFu.expiringPolicies.count).toBe("number");
    expect(typeof gmFu.openRequests).toBe("number");
    expect(gmFu.activeClaims).not.toBeNull();      // GM له صلاحية المطالبات
    expect(gmFu.unpaidCommissions).not.toBeNull(); // GM له صلاحية المالية

    const repFu = (await request(app.getHttpServer()).get("/crm/follow-up").set(auth(assigneeToken)).expect(200)).body;
    expect(repFu.activeClaims).toBeNull();          // مندوب مبيعات بلا claims
    expect(repFu.unpaidCommissions).toBeNull();     // بلا finance
  });

  it("مجدول التذكيرات: مهمة بلغت الاستحقاق ⇒ تذكير للمُسنَد إليه، بلا تكرار (idempotent)", async () => {
    // مهمة مستحقّة (تاريخ ماضٍ) مُسنَدة للمُسنَد إليه الفريد لهذا الملف
    const title = `تذكير-مستحق-${Date.now()}`;
    await request(app.getHttpServer()).post("/crm/tasks").set(auth(gm)).send({ title, assigneeId, dueDate: "2020-01-01" }).expect(201);

    // تشغيل المسح يدويًا (مقصور على مستأجر المُستدعي) ⇒ يلتقط المهمة المستحقّة
    const run1 = (await request(app.getHttpServer()).post("/reminders/run").set(auth(gm)).expect(201)).body as { tasks: number; renewals: number };
    expect(run1.tasks).toBeGreaterThanOrEqual(1);

    // وصل تذكير staff_task_due للمُسنَد إليه
    let inbox: Array<{ eventKey: string }> = [];
    for (let i = 0; i < 25 && !inbox.some((n) => n.eventKey === "staff_task_due"); i++) {
      inbox = (await request(app.getHttpServer()).get("/notifications/inbox").set(auth(assigneeToken))).body;
      if (!inbox.some((n) => n.eventKey === "staff_task_due")) await new Promise((r) => setTimeout(r, 40));
    }
    const dueCount1 = inbox.filter((n) => n.eventKey === "staff_task_due").length;
    expect(dueCount1).toBeGreaterThanOrEqual(1);

    // تشغيل ثانٍ فورًا ⇒ لا يُعاد تذكير نفس المهمة (وُسِمت reminderSentAt)
    await request(app.getHttpServer()).post("/reminders/run").set(auth(gm)).expect(201);
    await new Promise((r) => setTimeout(r, 150));
    const inbox2 = (await request(app.getHttpServer()).get("/notifications/inbox").set(auth(assigneeToken))).body as Array<{ eventKey: string }>;
    const dueCount2 = inbox2.filter((n) => n.eventKey === "staff_task_due").length;
    expect(dueCount2).toBe(dueCount1); // بلا تكرار
  });

  it("عزل صلاحية: بلا وحدة المبيعات ⇒ 403 (يشمل تشغيل التذكيرات)", async () => {
    await request(app.getHttpServer()).get("/crm/deals").set(auth(noSales)).expect(403);
    await request(app.getHttpServer()).post("/reminders/run").set(auth(noSales)).expect(403);
  });
});
