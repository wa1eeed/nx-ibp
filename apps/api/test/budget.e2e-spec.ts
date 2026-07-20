/**
 * §1.8 — الموازنة التقديرية مقابل الفعلي (Budget vs Actual):
 *  - ضبط موازنة لحساب في سنة/فترة (سنوية/ربعية) + عرضها + upsert بلا تكرار.
 *  - المقارنة: الفعلي مُشتقّ من حركة السندات ضمن نطاق تاريخ الفترة (سنة مستقبلية ⇒ فعلي صفر ⇒ انحراف = −الموازنة).
 *  - تحقّق (فترة/حساب) + حذف + عزل بين الشركات + صلاحية المالية.
 * كل شركة تُنشأ عبر التسجيل الذاتي (لها شجرة حسابات + صلاحية finance في الباقة الأساسية) ⇒ عزل تامّ.
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

describe("§1.8 الموازنة التقديرية مقابل الفعلي (e2e)", () => {
  let app: INestApplication;
  const srv = () => app.getHttpServer();
  const uniq = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const owner = async () => (await request(srv()).post("/signup").send({ companyName: `موازنة ${uniq()}`, adminName: "مالك", adminEmail: `bd-${uniq()}@brk.sa`, password: "Owner1Pass", seatCount: 25 }).expect(201)).body.accessToken;
  const SAL = "05030000000000000"; // الرواتب والأجور (مصروف)
  const RENT = "05040000000000000"; // الإيجارات (مصروف)
  const YR = 2099; // سنة مستقبلية ⇒ لا سندات ⇒ فعلي صفر (حتمي)

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  afterAll(async () => { await app?.close(); });

  it("ضبط موازنة لحساب + عرضها لسنة", async () => {
    const t = await owner();
    await request(srv()).post("/finance/budget").set(auth(t)).send({ fiscalYear: YR, period: "annual", accountCode: SAL, amount: 100000 }).expect(201);
    const b = (await request(srv()).get(`/finance/budget?year=${YR}`).set(auth(t)).expect(200)).body;
    expect(b.lines.length).toBe(1);
    expect(b.lines[0].accountCode).toBe(SAL);
    expect(b.lines[0].amount).toBe(100000);
    expect(b.lines[0].accountType).toBe("expense");
  });

  it("الموازنة مقابل الفعلي: فعلي صفر لسنة مستقبلية ⇒ انحراف = −الموازنة", async () => {
    const t = await owner();
    await request(srv()).post("/finance/budget").set(auth(t)).send({ fiscalYear: YR, period: "annual", accountCode: SAL, amount: 100000 }).expect(201);
    const r = (await request(srv()).get(`/finance/budget/vs-actual?year=${YR}&period=annual`).set(auth(t)).expect(200)).body;
    expect(r.from).toBe(`${YR}-01-01`);
    expect(r.to).toBe(`${YR}-12-31`);
    const row = r.rows.find((x: any) => x.accountCode === SAL);
    expect(row.budget).toBe(100000);
    expect(row.actual).toBe(0); // لا حركة سندات في سنة مستقبلية
    expect(row.variance).toBe(-100000); // الفعلي − الموازنة
    expect(row.variancePct).toBe(-100);
    expect(r.totals).toEqual({ budget: 100000, actual: 0, variance: -100000 });
  });

  it("upsert: إعادة الضبط تحدّث المبلغ بلا تكرار", async () => {
    const t = await owner();
    await request(srv()).post("/finance/budget").set(auth(t)).send({ fiscalYear: YR, period: "Q1", accountCode: SAL, amount: 25000 }).expect(201);
    await request(srv()).post("/finance/budget").set(auth(t)).send({ fiscalYear: YR, period: "Q1", accountCode: SAL, amount: 30000 }).expect(201);
    const b = (await request(srv()).get(`/finance/budget?year=${YR}`).set(auth(t)).expect(200)).body;
    const q1 = b.lines.filter((l: any) => l.period === "Q1" && l.accountCode === SAL);
    expect(q1.length).toBe(1);
    expect(q1[0].amount).toBe(30000);
  });

  it("تحقّق: فترة غير صالحة أو حساب مجهول ⇒ 400", async () => {
    const t = await owner();
    await request(srv()).post("/finance/budget").set(auth(t)).send({ fiscalYear: YR, period: "H1", accountCode: SAL, amount: 1000 }).expect(400); // فترة غير صالحة
    await request(srv()).post("/finance/budget").set(auth(t)).send({ fiscalYear: YR, period: "annual", accountCode: "99999999999999999", amount: 1000 }).expect(400); // حساب مجهول
    await request(srv()).get(`/finance/budget/vs-actual?year=${YR}&period=H1`).set(auth(t)).expect(400);
  });

  it("حذف بند موازنة", async () => {
    const t = await owner();
    await request(srv()).post("/finance/budget").set(auth(t)).send({ fiscalYear: YR, period: "annual", accountCode: RENT, amount: 50000 }).expect(201);
    let b = (await request(srv()).get(`/finance/budget?year=${YR}`).set(auth(t)).expect(200)).body;
    const line = b.lines.find((l: any) => l.accountCode === RENT);
    await request(srv()).delete(`/finance/budget/${line.id}`).set(auth(t)).expect(200);
    b = (await request(srv()).get(`/finance/budget?year=${YR}`).set(auth(t)).expect(200)).body;
    expect(b.lines.find((l: any) => l.accountCode === RENT)).toBeUndefined();
  });

  it("عزل: موازنة شركة لا تظهر لأخرى", async () => {
    const a = await owner();
    await request(srv()).post("/finance/budget").set(auth(a)).send({ fiscalYear: YR, period: "annual", accountCode: SAL, amount: 77000 }).expect(201);
    const b = await owner();
    const r = (await request(srv()).get(`/finance/budget?year=${YR}`).set(auth(b)).expect(200)).body;
    expect(r.lines.length).toBe(0);
  });

  it("صلاحية: مستخدم بلا صلاحية المالية ⇒ 403", async () => {
    const t = await owner();
    const email = `nf-${uniq()}@brk.sa`;
    await request(srv()).post("/staff").set(auth(t)).send({ fullName: "بلا مالية", email, password: "Passw0rd1", roleName: `دور-${uniq()}`, permissions: [{ module: "sales", canAccess: true, canCreate: false, canEdit: false, canDelete: false }] }).expect(201);
    const nf = (await request(srv()).post("/auth/login").send({ email, password: "Passw0rd1" })).body.accessToken;
    await request(srv()).get(`/finance/budget?year=${YR}`).set(auth(nf)).expect(403);
  });
});
