/**
 * اختبار أهداف الأداء (P1-B): إنشاء هدف لوسيط فرعي/فرع تأمين + احتساب الإنجاز من الإنتاج
 * الفعلي (وثائق مُصدَرة)، مع فلترة الفترة، والعزل، وحارس الصلاحية.
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

describe("الأهداف والأداء (e2e)", () => {
  let app: INestApplication;
  const srv = () => app.getHttpServer();
  const uniq = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  let gm: string; // مدير عام gulf (reports ACED)

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    gm = (await request(srv()).post("/auth/login").send({ email: "waleed@gulf-demo.sa", password: "Passw0rd!" })).body.accessToken;
  });
  afterAll(async () => { await app?.close(); });

  it("خيارات الإنشاء: مقاييس/فترات/نطاقات + فروع التأمين من الإنتاج", async () => {
    const o = (await request(srv()).get("/targets/options").set(auth(gm)).expect(200)).body;
    expect(o.metrics).toEqual(expect.arrayContaining(["premium", "policies", "commissions"]));
    expect(o.periods).toEqual(expect.arrayContaining(["month", "quarter", "year"]));
    expect(Array.isArray(o.lines)).toBe(true);
  });

  it("إنشاء هدف فرع تأمين ⇒ يحسب الفعلي و% الإنجاز من الوثائق المُصدَرة", async () => {
    const o = (await request(srv()).get("/targets/options").set(auth(gm)).expect(200)).body;
    const line = o.lines[0];
    expect(line).toBeTruthy();
    const res = await request(srv()).post("/targets").set(auth(gm)).send({
      scope: "line", scopeRefId: line, metric: "premium", period: "year", periodStart: "2026-01-01T00:00:00.000Z", targetValue: 1000000,
    }).expect(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.target).toBe(1000000);
    expect(typeof res.body.actual).toBe("number");
    expect(res.body.actual).toBeGreaterThanOrEqual(0);
    expect(typeof res.body.achievementPct).toBe("number");
    // يظهر في القائمة
    const list = (await request(srv()).get("/targets").set(auth(gm)).expect(200)).body as Array<{ id: string }>;
    expect(list.some((r) => r.id === res.body.id)).toBe(true);
    // فلترة بفترة مختلفة تُخفيه
    const monthly = (await request(srv()).get("/targets?period=month").set(auth(gm)).expect(200)).body as Array<{ id: string }>;
    expect(monthly.some((r) => r.id === res.body.id)).toBe(false);
    // حذف
    await request(srv()).delete(`/targets/${res.body.id}`).set(auth(gm)).expect(200);
  });

  it("قيمة هدف غير موجبة ⇒ 400", () =>
    request(srv()).post("/targets").set(auth(gm)).send({ scope: "line", scopeRefId: "X", metric: "premium", period: "month", periodStart: "2026-01-01T00:00:00.000Z", targetValue: 0 }).expect(400));

  it("موظف بلا صلاحية التقارير ⇒ 403", async () => {
    const email = `tg-${uniq()}@gulf-demo.sa`;
    await request(srv()).post("/staff").set(auth(gm)).send({ fullName: "موظف", email, password: "Worker1Pass", roleName: `بلا تقارير ${uniq()}`, permissions: [{ module: "clients", canAccess: true, canCreate: false, canEdit: false, canDelete: false }] }).expect(201);
    const staff = (await request(srv()).post("/auth/login").send({ email, password: "Worker1Pass" })).body.accessToken;
    await request(srv()).get("/targets").set(auth(staff)).expect(403);
  });

  it("عزل: مستأجر آخر لا يرى أهداف غيره", async () => {
    const line = (await request(srv()).get("/targets/options").set(auth(gm)).expect(200)).body.lines[0] ?? "MED";
    const created = await request(srv()).post("/targets").set(auth(gm)).send({ scope: "line", scopeRefId: line, metric: "policies", period: "year", periodStart: "2026-01-01T00:00:00.000Z", targetValue: 50 }).expect(201);
    const other = (await request(srv()).post("/auth/login").send({ email: "omar@aman-demo.sa", password: "Passw0rd!" })).body.accessToken;
    const list = (await request(srv()).get("/targets").set(auth(other)).expect(200)).body as Array<{ id: string }>;
    expect(list.some((r) => r.id === created.body.id)).toBe(false);
    await request(srv()).delete(`/targets/${created.body.id}`).set(auth(gm)).expect(200);
  });
});
