/**
 * اختبار وحدة المستندات (تحقّق المرحلة 5):
 *  - رفع/عرض عبر روابط موقّتة فقط (لا روابط عامة دائمة).
 *  - حد الرفع حسب الباقة (entitlement) + رفض الأنواع غير المسموحة.
 *  - العزل بالمستأجر. تسجيل توليد الرابط في التدقيق.
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

const pathOf = (url: string) => new URL(url).pathname;

describe("وحدة المستندات (e2e)", () => {
  let app: INestApplication;
  let gm: string; // الخليج (premium ⇒ 25MB)
  let amanGm: string; // الأمان (basic ⇒ 10MB)

  const login = async (email: string) =>
    (await request(app.getHttpServer()).post("/auth/login").send({ email, password: "Passw0rd!" })).body.accessToken as string;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    gm = await login("waleed@gulf-demo.sa");
    amanGm = await login("omar@aman-demo.sa");
  });

  afterAll(async () => {
    await app?.close();
  });

  const entityId = `cl-fahd`;

  it("يرفض نوع ملف غير مسموح (تنفيذي) ⇒ 400", () =>
    request(app.getHttpServer()).post("/documents/upload-url").set(auth(gm))
      .send({ entityType: "client", entityId, fileName: "x.exe", mime: "application/x-msdownload", sizeBytes: 1024 }).expect(400));

  it("يرفض حجماً يتجاوز حد الباقة (enterprise 100MB) ⇒ 403", () =>
    request(app.getHttpServer()).post("/documents/upload-url").set(auth(gm))
      .send({ entityType: "client", entityId, fileName: "big.pdf", mime: "application/pdf", sizeBytes: 120 * 1024 * 1024 }).expect(403));

  it("يرفض الوصول لرابط blob بتوكن غير صالح ⇒ 403 (لا روابط عامة)", () =>
    request(app.getHttpServer()).get("/documents/blob/not-a-valid-token").expect(403));

  it("يرفض upload-url بلا مصادقة ⇒ 401", () =>
    request(app.getHttpServer()).post("/documents/upload-url")
      .send({ entityType: "client", entityId, fileName: "a.pdf", mime: "application/pdf", sizeBytes: 100 }).expect(401));

  it("دورة كاملة: رابط رفع ← رفع ← رابط عرض ← تنزيل", async () => {
    const bytes = Buffer.from("%PDF-1.4 mock id document");
    // 1) رابط رفع موقّت
    const up = (await request(app.getHttpServer()).post("/documents/upload-url").set(auth(gm))
      .send({ entityType: "client", entityId, fileName: "national-id.pdf", mime: "application/pdf", sizeBytes: bytes.length, docType: "OFFICIAL" }).expect(201)).body;
    expect(up.documentId).toBeTruthy();
    expect(up.docType).toBe("OFFICIAL");
    expect(up.upload.method).toBe("PUT");
    expect(up.upload.expiresIn).toBe(300); // 5 دقائق

    // 2) رفع البايتات عبر الرابط الموقّت
    await request(app.getHttpServer()).put(pathOf(up.upload.url)).set("Content-Type", "application/pdf").send(bytes).expect(200);

    // 3) رابط عرض موقّت (يُسجَّل في التدقيق)
    const view = (await request(app.getHttpServer()).get(`/documents/${up.documentId}/url`).set(auth(gm)).expect(200)).body;
    expect(view.view.url).toContain("/documents/blob/");

    // 4) تنزيل المحتوى عبر رابط العرض
    const dl = await request(app.getHttpServer()).get(pathOf(view.view.url)).expect(200);
    expect(dl.body.toString()).toContain("mock id document");

    // 5) القائمة تتضمّن المستند
    const list = (await request(app.getHttpServer()).get(`/documents?entityType=client&entityId=${entityId}`).set(auth(gm)).expect(200)).body;
    expect(list.some((d: { id: string }) => d.id === up.documentId)).toBe(true);
  });

  it("العزل: مستأجر الأمان لا يرى مستندات الخليج لنفس الكيان", async () => {
    const list = (await request(app.getHttpServer()).get(`/documents?entityType=client&entityId=${entityId}`).set(auth(amanGm)).expect(200)).body;
    expect(list.every((d: { tenantId: string }) => d.tenantId === "demo-tenant-2")).toBe(true);
  });

  it("المستودع المركزي: كل المستندات + فلترة بالتصنيف + عزل بين المستأجرين", async () => {
    const srv = app.getHttpServer();
    const all = (await request(srv).get("/documents/all").set(auth(gm)).expect(200)).body as Array<{ id: string; docType: string; entityType: string; fileName: string }>;
    expect(all.length).toBeGreaterThan(0); // يشمل مستند الدورة الكاملة أعلاه
    // فلترة بالتصنيف
    const official = (await request(srv).get("/documents/all?docType=OFFICIAL").set(auth(gm)).expect(200)).body as Array<{ docType: string }>;
    expect(official.every((d) => d.docType === "OFFICIAL")).toBe(true);
    // فلترة بنوع الكيان
    const byEntity = (await request(srv).get("/documents/all?entityType=client").set(auth(gm)).expect(200)).body as Array<{ entityType: string }>;
    expect(byEntity.every((d) => d.entityType === "client")).toBe(true);
    // عزل: عدد مستندات الأمان مختلف عن الخليج (لا تسريب)
    const amanAll = (await request(srv).get("/documents/all").set(auth(amanGm)).expect(200)).body as unknown[];
    expect(amanAll.length).not.toBe(all.length);
    // بلا مصادقة ⇒ 401
    await request(srv).get("/documents/all").expect(401);
  });

  it("كتالوج المنتجات بإحصاءات المستأجر: فئات + نسبة ضريبة (حياة 0%) + إنتاج لكل فرع", async () => {
    const srv = app.getHttpServer();
    const classes = (await request(srv).get("/catalog/stats").set(auth(gm)).expect(200)).body as Array<{ code: string; vatRate: number; lines: Array<{ code: string; hasForm: boolean; count: number; premium: number }> }>;
    expect(classes.length).toBeGreaterThan(0);
    const lif = classes.find((c) => c.code === "LIF");
    if (lif) expect(lif.vatRate).toBe(0); // تأمين الحياة معفى
    expect(classes.every((c) => c.vatRate === 0 || c.vatRate === 15)).toBe(true);
    // كل فرع يحمل إحصاءات (قد تكون صفرية) + جاهزية النموذج
    const anyLine = classes.flatMap((c) => c.lines)[0];
    expect(anyLine).toHaveProperty("count");
    expect(anyLine).toHaveProperty("hasForm");
  });
});
