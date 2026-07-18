/**
 * اختبار المرحلة 9 (التكاملات التنظيمية والمالية):
 *  - فاتورة ZATCA (Fatoora): رمز QR بترميز TLV قابل للفكّ بالحقول الخمسة الإلزامية.
 *  - قراءات المالية: الملخّص، شجرة الحسابات، الذمم.
 *  - لوحة الالتزام (module.compliance) + حالة التكاملات التنظيمية.
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { decodeZatcaQr } from "../src/common/zatca/zatca.util";

describe("التكاملات التنظيمية والمالية (e2e)", () => {
  let app: INestApplication;
  let gm: string; // الخليج (premium + إضافات)
  let omar: string; // الأمان (basic)

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

  it("الفواتير مرفقة بحزمة ZATCA — TLV يفكّ للحقول الخمسة", async () => {
    const res = await request(app.getHttpServer()).get("/finance/invoices").set(auth(gm)).expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    const z = res.body[0].zatca;
    expect(z.uuid).toBeTruthy();
    expect(z.hash).toBeTruthy();
    const tlv = decodeZatcaQr(z.qr);
    expect(tlv[1]).toContain("الخليج"); // اسم البائع
    expect(tlv[2]).toMatch(/^\d{15}$/); // الرقم الضريبي 15 رقماً
    expect(tlv[3]).toBeTruthy(); // الطابع الزمني
    expect(Number(tlv[4])).toBeGreaterThanOrEqual(0); // الإجمالي
    expect(tlv[5]).toBeDefined(); // الضريبة
  });

  it("الملخّص المالي يفصل الأمانات (خارج الميزانية)", async () => {
    const res = await request(app.getHttpServer()).get("/finance/summary").set(auth(gm)).expect(200);
    expect(res.body.grossPremium).toBeGreaterThan(0);
    expect(res.body.offBalanceTrust).toBeGreaterThan(0);
  });

  it("شجرة الحسابات تتضمّن حساباً خارج الميزانية (أمانات العملاء)", async () => {
    const res = await request(app.getHttpServer()).get("/finance/coa").set(auth(gm)).expect(200);
    expect(res.body.some((a: { isOnBalance: boolean }) => a.isOnBalance === false)).toBe(true);
  });

  it("الذمم المدينة مُجمّعة حسب العميل", async () => {
    const res = await request(app.getHttpServer()).get("/finance/receivables").set(auth(gm)).expect(200);
    expect(res.body.outstanding).toBeGreaterThan(0);
    expect(res.body.byClient.length).toBeGreaterThanOrEqual(1);
  });

  it("لوحة الالتزام: حالة العملاء وتوزيع المخاطر", async () => {
    const res = await request(app.getHttpServer()).get("/compliance/overview").set(auth(gm)).expect(200);
    expect(res.body.clientsByStatus.length).toBeGreaterThanOrEqual(1);
    expect(res.body.riskDistribution.length).toBeGreaterThanOrEqual(1);
  });

  it("الالتزام والتدقيق موديول أساسي (متطلّب هيئة التأمين) ⇒ متاح للأساسية 200", () =>
    request(app.getHttpServer()).get("/compliance/overview").set(auth(omar)).expect(200));

  it("حالة التكاملات التنظيمية (Sandbox)", async () => {
    const res = await request(app.getHttpServer()).get("/regulatory/status").set(auth(gm)).expect(200);
    expect(res.body.environment).toBe("sandbox");
    expect(res.body.connectors.length).toBe(9);
    expect(res.body.connectors.some((c: { key: string }) => c.key === "zatca")).toBe(true);
  });

  it("§9.3: لوحة الجاهزية تعكس وضع البوّابة والمفاتيح (بلا مفاتيح ⇒ sandbox/غير مُهيّأ)", async () => {
    const res = await request(app.getHttpServer()).get("/regulatory/status").set(auth(gm)).expect(200);
    expect(res.body.gatewayMode).toBe("sandbox"); // VERIFY_GATEWAY غير مضبوط في الاختبار
    expect(res.body.summary.live).toBe(0);
    // كل موصِّلات التحقّق تحمل علَم configured (بلا مفاتيح ⇒ false)؛ ومنها نفاذ/يقين/واثق
    const y = res.body.connectors.find((c: { key: string }) => c.key === "yaqeen");
    expect(y.configured).toBe(false);
    expect(y.environment).toBe("sandbox");
    expect(res.body.connectors.every((c: { configured?: unknown }) => typeof c.configured === "boolean")).toBe(true);
  });
});
