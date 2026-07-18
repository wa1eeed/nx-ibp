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

  // ── كشف المؤمِّن الدوري (Bordereau) — §6.3 ───────────────────────────────
  it("كشف المؤمِّن: صفوف الوثائق المُصدرة + الصافي للمؤمِّن = الإجمالي − العمولة", async () => {
    const res = await request(app.getHttpServer()).get("/reports/bordereau").set(auth(gm)).expect(200);
    expect(Array.isArray(res.body.rows)).toBe(true);
    expect(res.body.rows.length).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(res.body.insurers)).toBe(true);
    for (const r of res.body.rows) {
      expect(Math.abs(r.netToInsurer - (r.gross - r.commission))).toBeLessThan(0.011);
    }
    // المجاميع تساوي مجموع الصفوف
    const sumNet = res.body.rows.reduce((s: number, r: { netToInsurer: number }) => s + r.netToInsurer, 0);
    expect(Math.abs(res.body.totals.netToInsurer - sumNet)).toBeLessThan(0.1);
    expect(res.body.totals.count).toBe(res.body.rows.length);
  });

  it("كشف المؤمِّن: التصفية بشركة تأمين تُرجع صفوف تلك الشركة فقط", async () => {
    const all = (await request(app.getHttpServer()).get("/reports/bordereau").set(auth(gm))).body;
    const insurer = all.insurers[0]?.name as string;
    expect(insurer).toBeTruthy();
    const res = await request(app.getHttpServer()).get(`/reports/bordereau?insurer=${encodeURIComponent(insurer)}`).set(auth(gm)).expect(200);
    expect(res.body.rows.length).toBeGreaterThanOrEqual(1);
    expect(res.body.rows.every((r: { insurerName: string }) => r.insurerName === insurer)).toBe(true);
    expect(res.body.rows.length).toBeLessThanOrEqual(all.rows.length);
  });

  it("كشف المؤمِّن: التصفية بفترة مستقبلية تُرجع صفرًا", async () => {
    const res = await request(app.getHttpServer()).get("/reports/bordereau?from=2099-01-01&to=2099-12-31").set(auth(gm)).expect(200);
    expect(res.body.rows.length).toBe(0);
    expect(res.body.totals.count).toBe(0);
    expect(res.body.totals.netToInsurer).toBe(0);
  });

  it("كشف المؤمِّن: عزل — كل مستأجر يرى وثائقه فقط (الأمان ⊄ الخليج)", async () => {
    const srv = app.getHttpServer();
    const gulf = (await request(srv).get("/reports/bordereau").set(auth(gm)).expect(200)).body;
    const aman = (await request(srv).get("/reports/bordereau").set(auth(omar)).expect(200)).body; // module.reports أساسي لكل الباقات
    const gulfPolicies = new Set(gulf.rows.map((r: { sequenceNo: string }) => r.sequenceNo));
    // لا تتقاطع أرقام وثائق الأمان مع الخليج
    expect(aman.rows.every((r: { sequenceNo: string }) => !gulfPolicies.has(r.sequenceNo))).toBe(true);
    expect(gulf.totals.netToInsurer).not.toBe(aman.totals.netToInsurer);
  });

  // ── تصدير CSV (§7.1) ────────────────────────────────────────────────────
  it("تصدير CSV: كشف المؤمِّن يُرجع ملفًّا نصيًّا (text/csv) بترويسة الأعمدة + صفوف + صفّ الإجمالي", async () => {
    const res = await request(app.getHttpServer()).get("/reports/export/bordereau").set(auth(gm)).expect(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain("bordereau");
    const csv = res.text;
    expect(csv.charCodeAt(0)).toBe(0xfeff); // BOM لدعم العربية في Excel
    const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
    expect(lines[0]).toContain("الصافي للمؤمِّن"); // ترويسة الأعمدة
    expect(lines.length).toBeGreaterThanOrEqual(2); // ترويسة + صفّ إجمالي على الأقل
    expect(lines[lines.length - 1].startsWith("الإجمالي")).toBe(true);
  });

  it("تصدير CSV: العمولات تُصدَّر · مفتاح غير معروف ⇒ 400", async () => {
    const res = await request(app.getHttpServer()).get("/reports/export/commissions").set(auth(gm)).expect(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.text.replace(/^﻿/, "").split("\r\n")[0]).toContain("المؤمِّن");
    await request(app.getHttpServer()).get("/reports/export/nope").set(auth(gm)).expect(400);
  });
});
