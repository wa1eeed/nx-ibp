/**
 * اختبار التقارير والتحليلات (تحقّق المرحلة 8ج):
 *  - بيانات حقيقية مجمّعة (لوحة التحكّم/العمولات/الإنتاج/المطالبات/هيئة التأمين).
 *  - بوّابة الباقة: موديول reports مدفوع ⇒ مستأجر basic بلا الإضافة يُرفض (403) من التحليلات
 *    لكنه يصل للوحة التحكّم (موديول أساسي). والعزل: كل مستأجر يرى أرقامه فقط.
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

describe("التقارير والتحليلات (e2e)", () => {
  let app: INestApplication;
  let gm: string; // الخليج (premium + إضافة reports)
  let omar: string; // الأمان (basic، بلا reports)

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    const srv = app.getHttpServer();
    gm = (await request(srv).post("/auth/login").send({ email: "waleed@gulf-demo.sa", password: "Passw0rd!" })).body.accessToken;
    omar = (await request(srv).post("/auth/login").send({ email: "omar@aman-demo.sa", password: "Passw0rd!" })).body.accessToken;
  });

  afterAll(async () => {
    await app?.close();
  });

  it("لوحة التحكّم تعيد مؤشّرات حقيقية", async () => {
    const res = await request(app.getHttpServer()).get("/reports/dashboard").set(auth(gm)).expect(200);
    expect(res.body.kpis.commissions).toBeGreaterThan(0);
    expect(res.body.kpis.renewalsCount).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(res.body.recentActivity)).toBe(true);
  });

  it("اتّساق: «عمولات معلّقة» في اللوحة = «المعلّقة» في صفحة العمولات (لا الإجمالي)", async () => {
    const srv = app.getHttpServer();
    const dash = (await request(srv).get("/reports/dashboard").set(auth(gm))).body;
    const comm = (await request(srv).get("/reports/commissions").set(auth(gm))).body;
    expect(dash.kpis.commissions).toBe(comm.summary.accrued);
    expect(dash.kpis.commissions).toBeLessThan(comm.summary.total); // معلّقة < الإجمالي
  });

  it("تقرير العمولات: متوقّع/مستلم/مستحقّ/فرق", async () => {
    const res = await request(app.getHttpServer()).get("/reports/commissions").set(auth(gm)).expect(200);
    // مجاميع على مستوى المستأجر تنمو مع البيانات — نتحقّق من العلاقات لا قيم صلبة.
    expect(res.body.summary.total).toBeGreaterThanOrEqual(78900);
    expect(res.body.summary.received).toBeGreaterThan(0);
    expect(res.body.summary.total).toBeGreaterThanOrEqual(res.body.summary.received);
    expect(res.body.rows.length).toBeGreaterThanOrEqual(4);
  });

  it("تحليلات الإنتاج: GWP، نسبة التحويل، حسب الفرع/الشركة", async () => {
    const res = await request(app.getHttpServer()).get("/reports/production").set(auth(gm)).expect(200);
    expect(res.body.totalGwp).toBeGreaterThan(0);
    expect(res.body.policyCount).toBeGreaterThanOrEqual(4);
    expect(res.body.byLine.length).toBeGreaterThanOrEqual(1);
    expect(res.body.byInsurer.length).toBeGreaterThanOrEqual(1);
    expect(res.body.conversionRate).toBeGreaterThanOrEqual(0);
  });

  it("تحليلات المطالبات: نسبة الخسارة وحسب الحالة", async () => {
    const res = await request(app.getHttpServer()).get("/reports/claims").set(auth(gm)).expect(200);
    expect(res.body.totalSettled).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(res.body.byStatus)).toBe(true);
    expect(typeof res.body.lossRatio).toBe("number");
  });

  it("تقرير هيئة التأمين الموحّد", async () => {
    const res = await request(app.getHttpServer()).get("/reports/regulatory").set(auth(gm)).expect(200);
    expect(res.body.grossWrittenPremium).toBeGreaterThan(0);
    expect(res.body.brokerageCommission).toBeGreaterThanOrEqual(78900);
  });

  it("كتالوج التقارير الـ12", async () => {
    const res = await request(app.getHttpServer()).get("/reports/catalog").set(auth(gm)).expect(200);
    expect(res.body.length).toBe(12);
  });

  it("بوّابة الباقة: مستأجر basic بلا إضافة reports ⇒ 403 من التحليلات", () =>
    request(app.getHttpServer()).get("/reports/production").set(auth(omar)).expect(403));

  it("لوحة التحكّم متاحة لكل المستأجرين (موديول أساسي) ⇒ 200", () =>
    request(app.getHttpServer()).get("/reports/dashboard").set(auth(omar)).expect(200));

  it("عزل: أرقام المستأجر الثاني تخصّه وحده", async () => {
    const res = await request(app.getHttpServer()).get("/reports/dashboard").set(auth(omar)).expect(200);
    // الأمان لديه عمولة واحدة مستحقّة (2240) — أقلّ بكثير من الخليج (78900)
    expect(res.body.kpis.commissions).toBeLessThan(78900);
  });
});
