/**
 * §8.1 — الرواتب (Payroll):
 *  - إنشاء كشف لفترة ⇒ يُعبّأ آليًا بالموظفين النشطين (أساسي 0).
 *  - تعديل بند (أساسي/بدلات/استقطاعات) ⇒ الصافي = أساسي + بدلات − استقطاعات.
 *  - الترحيل ⇒ سند مصروف (مدين رواتب 05030 / دائن نقد 0101) بصافي الكشف؛ ويظهر في ميزان المراجعة.
 *  - حواجز: إعادة ترحيل 409 · تعديل بند مُرحَّل 409 · تكرار فترة 409 · فترة غير صالحة 400 · عزل + RBAC.
 * تُنفَّذ في شركة عبر التسجيل الذاتي (المالك موظف نشط وحيد ⇒ بند واحد).
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

describe("§8.1 الرواتب (e2e)", () => {
  let app: INestApplication;
  const srv = () => app.getHttpServer();
  const uniq = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const owner = async () => (await request(srv()).post("/signup").send({ companyName: `رواتب ${uniq()}`, adminName: "مالك", adminEmail: `pr-${uniq()}@brk.sa`, password: "Owner1Pass" }).expect(201)).body.accessToken;
  const SAL = "05030000000000000";

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  afterAll(async () => { await app?.close(); });

  it("إنشاء كشف ⇒ تعبئة آلية بالموظفين، وتعديل البند ⇒ صافي صحيح", async () => {
    const t = await owner();
    const run = (await request(srv()).post("/payroll").set(auth(t)).send({ period: "2026-07" }).expect(201)).body;
    expect(run.status).toBe("draft");
    expect(run.lines.length).toBeGreaterThanOrEqual(1); // المالك موظف نشط
    const line = run.lines[0];
    expect(line.net).toBe(0);
    const updated = (await request(srv()).patch(`/payroll/lines/${line.id}`).set(auth(t)).send({ baseSalary: 10000, allowances: 2000, deductions: 500 }).expect(200)).body;
    const l = updated.lines.find((x: any) => x.id === line.id);
    expect(l.net).toBe(11500); // 10000 + 2000 − 500
    expect(updated.totals.net).toBe(11500);
  });

  it("الترحيل ⇒ سند مصروف بصافي الكشف، ويظهر مدينًا في حساب الرواتب (05030)", async () => {
    const t = await owner();
    const run = (await request(srv()).post("/payroll").set(auth(t)).send({ period: "2026-08" }).expect(201)).body;
    await request(srv()).patch(`/payroll/lines/${run.lines[0].id}`).set(auth(t)).send({ baseSalary: 8000, allowances: 1000, deductions: 0 }).expect(200);
    const posted = (await request(srv()).post(`/payroll/${run.id}/post`).set(auth(t)).expect(201)).body;
    expect(posted.ok).toBe(true);
    expect(posted.net).toBe(9000);
    expect(posted.voucher.sequenceNo).toMatch(/^JRV-/);
    // حساب الرواتب مدين بـ9000 في ميزان المراجعة
    const tb = (await request(srv()).get("/finance/trial-balance").set(auth(t)).expect(200)).body;
    const row = tb.rows.find((r: any) => r.account === SAL);
    expect(row.debit).toBe(9000);
    expect(tb.totals.balanced).toBe(true);
    // إعادة الترحيل ⇒ 409 · تعديل بند مُرحَّل ⇒ 409
    await request(srv()).post(`/payroll/${run.id}/post`).set(auth(t)).expect(409);
    await request(srv()).patch(`/payroll/lines/${run.lines[0].id}`).set(auth(t)).send({ baseSalary: 5000 }).expect(409);
  });

  it("حواجز: تكرار فترة 409 · فترة غير صالحة 400 · صافي صفر لا يُرحَّل 400", async () => {
    const t = await owner();
    await request(srv()).post("/payroll").set(auth(t)).send({ period: "2026-09" }).expect(201);
    await request(srv()).post("/payroll").set(auth(t)).send({ period: "2026-09" }).expect(409);
    await request(srv()).post("/payroll").set(auth(t)).send({ period: "2026-13" }).expect(400);
    const zero = (await request(srv()).post("/payroll").set(auth(t)).send({ period: "2026-10" }).expect(201)).body;
    await request(srv()).post(`/payroll/${zero.id}/post`).set(auth(t)).expect(400); // صافي 0
  });

  it("عزل: كشوف شركة لا تظهر لأخرى", async () => {
    const a = await owner();
    await request(srv()).post("/payroll").set(auth(a)).send({ period: "2026-07" }).expect(201);
    const b = await owner();
    expect((await request(srv()).get("/payroll").set(auth(b)).expect(200)).body.length).toBe(0);
  });

  it("صلاحية: مستخدم بلا صلاحية المالية ⇒ 403", async () => {
    const t = await owner();
    const email = `nf-${uniq()}@brk.sa`;
    await request(srv()).post("/staff").set(auth(t)).send({ fullName: "بلا مالية", email, password: "Passw0rd1", roleName: `دور-${uniq()}`, permissions: [{ module: "sales", canAccess: true, canCreate: false, canEdit: false, canDelete: false }] }).expect(201);
    const nf = (await request(srv()).post("/auth/login").send({ email, password: "Passw0rd1" })).body.accessToken;
    await request(srv()).get("/payroll").set(auth(nf)).expect(403);
  });
});
