/**
 * §7.3 — التقارير المجدولة/بالبريد:
 *  - إنشاء جدول (تقرير/دورية/مستلمون) + عرضه + `nextRunAt` مستقبلي.
 *  - «إرسال الآن» ⇒ يُرسل لكل مستلم (Sandbox ⇒ ok) ويضبط `lastSentAt` ويقدّم الموعد.
 *  - المسح (`/reminders/run`) يُرجع عدّاد `reports` (الجدول المستقبلي لا يُوزَّع).
 *  - تحقّق (تقرير/دورية/بريد) + تعديل + حذف + عزل + صلاحية reports.
 * كل شركة عبر التسجيل الذاتي (reports مشمول بالباقة الأساسية) ⇒ عزل تامّ.
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

describe("§7.3 التقارير المجدولة (e2e)", () => {
  let app: INestApplication;
  const srv = () => app.getHttpServer();
  const uniq = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const owner = async () => (await request(srv()).post("/signup").send({ companyName: `مجدول ${uniq()}`, adminName: "مالك", adminEmail: `rs-${uniq()}@brk.sa`, password: "Owner1Pass" }).expect(201)).body.accessToken;
  const mk = (t: string, body: object) => request(srv()).post("/reports/schedules").set(auth(t)).send(body);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  afterAll(async () => { await app?.close(); });

  it("إنشاء جدول + عرضه (موعد قادم مستقبلي)", async () => {
    const t = await owner();
    const s = (await mk(t, { reportKey: "dashboard", frequency: "weekly", recipients: ["gm@brk.sa"] }).expect(201)).body;
    expect(s.reportKey).toBe("dashboard");
    expect(s.frequency).toBe("weekly");
    expect(new Date(s.nextRunAt).getTime()).toBeGreaterThan(Date.now());
    const list = (await request(srv()).get("/reports/schedules").set(auth(t)).expect(200)).body;
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(s.id);
  });

  it("«إرسال الآن» يرسل لكل مستلم ويضبط lastSentAt ويقدّم الموعد", async () => {
    const t = await owner();
    const s = (await mk(t, { reportKey: "commissions", frequency: "monthly", recipients: ["a@brk.sa", "b@brk.sa"] }).expect(201)).body;
    const before = new Date(s.nextRunAt).getTime();
    const r = (await request(srv()).post(`/reports/schedules/${s.id}/run-now`).set(auth(t)).expect(201)).body;
    expect(r.ok).toBe(true);
    expect(r.sent).toBe(2); // مستلمان (Sandbox ⇒ ok)
    const list = (await request(srv()).get("/reports/schedules").set(auth(t)).expect(200)).body;
    expect(list[0].lastSentAt).not.toBeNull();
    expect(new Date(list[0].nextRunAt).getTime()).toBeGreaterThanOrEqual(before); // تقدّم الموعد
  });

  it("المسح (/reminders/run) يُرجع عدّاد التقارير؛ الجدول المستقبلي لا يُوزَّع", async () => {
    const t = await owner();
    await mk(t, { reportKey: "bordereau", frequency: "weekly", recipients: ["ceo@brk.sa"] }).expect(201);
    const r = (await request(srv()).post("/reminders/run").set(auth(t)).expect(201)).body;
    expect(typeof r.reports).toBe("number");
    expect(r.reports).toBe(0); // موعده القادم مستقبلي ⇒ غير مستحقّ
  });

  it("تحقّق: تقرير/دورية غير مدعومة أو بريد غير صالح أو بلا مستلمين ⇒ 400", async () => {
    const t = await owner();
    await mk(t, { reportKey: "nope", frequency: "weekly", recipients: ["x@brk.sa"] }).expect(400);
    await mk(t, { reportKey: "dashboard", frequency: "daily", recipients: ["x@brk.sa"] }).expect(400);
    await mk(t, { reportKey: "dashboard", frequency: "weekly", recipients: ["not-an-email"] }).expect(400);
    await mk(t, { reportKey: "dashboard", frequency: "weekly", recipients: [] }).expect(400);
  });

  it("تعديل (دورية + تفعيل) وحذف", async () => {
    const t = await owner();
    const s = (await mk(t, { reportKey: "dashboard", frequency: "weekly", recipients: ["x@brk.sa"] }).expect(201)).body;
    await request(srv()).patch(`/reports/schedules/${s.id}`).set(auth(t)).send({ frequency: "monthly", isActive: false }).expect(200);
    let list = (await request(srv()).get("/reports/schedules").set(auth(t)).expect(200)).body;
    expect(list[0].frequency).toBe("monthly");
    expect(list[0].isActive).toBe(false);
    await request(srv()).delete(`/reports/schedules/${s.id}`).set(auth(t)).expect(200);
    list = (await request(srv()).get("/reports/schedules").set(auth(t)).expect(200)).body;
    expect(list.length).toBe(0);
  });

  it("عزل: جدول شركة لا يظهر لأخرى", async () => {
    const a = await owner();
    await mk(a, { reportKey: "dashboard", frequency: "weekly", recipients: ["x@brk.sa"] }).expect(201);
    const b = await owner();
    const list = (await request(srv()).get("/reports/schedules").set(auth(b)).expect(200)).body;
    expect(list.length).toBe(0);
  });

  it("صلاحية: مستخدم بلا صلاحية التقارير ⇒ 403", async () => {
    const t = await owner();
    const email = `nr-${uniq()}@brk.sa`;
    await request(srv()).post("/staff").set(auth(t)).send({ fullName: "بلا تقارير", email, password: "Passw0rd1", roleName: `دور-${uniq()}`, permissions: [{ module: "sales", canAccess: true, canCreate: false, canEdit: false, canDelete: false }] }).expect(201);
    const nr = (await request(srv()).post("/auth/login").send({ email, password: "Passw0rd1" })).body.accessToken;
    await request(srv()).get("/reports/schedules").set(auth(nr)).expect(403);
  });
});
