/**
 * سجلّ الشكاوى (§6.1 — امتثال هيئة التأمين):
 *  - تسجيل شكوى برقم تسلسلي ومهلة معالجة (SLA) · إسناد/معالجة/تصعيد · ملاحظات · تقرير تنظيمي.
 *  - RBAC (صلاحية compliance) + العزل بين المستأجرين.
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

describe("سجلّ الشكاوى (e2e)", () => {
  let app: INestApplication;
  const srv = () => app.getHttpServer();
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const uniq = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  let gm: string; // الخليج (له compliance)
  let amanGm: string; // الأمان (عزل)

  const login = async (email: string) => (await request(srv()).post("/auth/login").send({ email, password: "Passw0rd!" })).body.accessToken as string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    gm = await login("waleed@gulf-demo.sa");
    amanGm = await login("omar@aman-demo.sa");
  });
  afterAll(async () => { await app?.close(); });

  it("دورة كاملة: تسجيل ⇒ مهلة SLA ⇒ ملاحظة ⇒ تصعيد ⇒ معالجة + التقرير التنظيمي", async () => {
    // فئة غير معروفة ⇒ 400
    await request(srv()).post("/complaints").set(auth(gm)).send({ category: "nope", source: "phone", subject: "س", description: "و" }).expect(400);

    // تسجيل شكوى ⇒ رقم CMP + مهلة (dueDate بعد اليوم)
    const c = (await request(srv()).post("/complaints").set(auth(gm)).send({ category: "service", source: "phone", subject: `تأخّر إصدار ${uniq()}`, description: "لم تُصدَر الوثيقة في الوقت المتّفق عليه", priority: "high" }).expect(201)).body;
    expect(c.sequenceNo).toMatch(/^CMP-/);
    expect(c.status).toBe("open");
    expect(new Date(c.dueDate).getTime()).toBeGreaterThan(Date.now());

    // يظهر في القائمة + فلترة بالحالة
    const list = (await request(srv()).get("/complaints?status=open").set(auth(gm)).expect(200)).body as Array<{ id: string; overdue: boolean }>;
    expect(list.some((x) => x.id === c.id)).toBe(true);

    // ملاحظة داخلية ⇒ تظهر في الخط الزمني
    const withNote = (await request(srv()).post(`/complaints/${c.id}/notes`).set(auth(gm)).send({ body: "تم التواصل مع العميل" }).expect(201)).body;
    expect(withNote.notes.length).toBe(1);
    expect(withNote.notes[0].authorName).toBeTruthy();

    // بدء المعالجة
    await request(srv()).put(`/complaints/${c.id}`).set(auth(gm)).send({ status: "investigating" }).expect(200);

    // تصعيد للهيئة ⇒ escalated
    const esc = (await request(srv()).post(`/complaints/${c.id}/escalate`).set(auth(gm)).expect(200)).body;
    expect(esc.escalated).toBe(true);
    expect(esc.status).toBe("escalated");

    // معالجة بلا ملخّص ⇒ 400 · مع ملخّص ⇒ resolved
    await request(srv()).post(`/complaints/${c.id}/resolve`).set(auth(gm)).send({ resolution: "" }).expect(400);
    const res = (await request(srv()).post(`/complaints/${c.id}/resolve`).set(auth(gm)).send({ resolution: "أُصدرت الوثيقة واعتُذر للعميل" }).expect(200)).body;
    expect(res.status).toBe("resolved");
    expect(res.resolvedAt).toBeTruthy();

    // التقرير التنظيمي
    const rep = (await request(srv()).get("/complaints/report").set(auth(gm)).expect(200)).body;
    expect(rep.total).toBeGreaterThan(0);
    expect(rep.byCategory.service).toBeGreaterThanOrEqual(1);
    expect(rep).toHaveProperty("slaCompliancePct");
    expect(rep.slaDays).toBe(5);
  });

  it("العزل: شكوى مستأجر لا تظهر لغيره · شكوى مجهولة 404", async () => {
    const c = (await request(srv()).post("/complaints").set(auth(gm)).send({ category: "billing", source: "email", subject: `فوترة ${uniq()}`, description: "خطأ في الفاتورة" }).expect(201)).body;
    const amanList = (await request(srv()).get("/complaints").set(auth(amanGm)).expect(200)).body as Array<{ id: string }>;
    expect(amanList.every((x) => x.id !== c.id)).toBe(true); // عزل تام
    await request(srv()).get(`/complaints/${c.id}`).set(auth(amanGm)).expect(404); // عبر مستأجر آخر
  });

  it("RBAC: موظف بلا صلاحية الالتزام ⇒ 403", async () => {
    const email = `noncompliance-${uniq()}@gulf-demo.sa`;
    await request(srv()).post("/staff").set(auth(gm)).send({ fullName: "موظف", email, password: "Worker1Pass", roleName: `بلا التزام ${uniq()}`, permissions: [{ module: "clients", canAccess: true, canCreate: false, canEdit: false, canDelete: false }] }).expect(201);
    const staff = (await request(srv()).post("/auth/login").send({ email, password: "Worker1Pass" })).body.accessToken;
    await request(srv()).get("/complaints").set(auth(staff)).expect(403);
    await request(srv()).post("/complaints").set(auth(staff)).send({ category: "other", source: "phone", subject: "x", description: "yyy" }).expect(403);
  });
});
