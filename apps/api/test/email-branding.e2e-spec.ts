/**
 * اختبار P0-A (البريد متعدّد المستأجرين — BYO Resend + fallback + ترقية) و
 *          P0-B (الهوية البصرية White-label): إعداد/تحقّق/عزل/صلاحيات + رفع شعار عام.
 * يعمل في وضع Sandbox (بلا NOTIFY_GATEWAY=live) فيحاكي Resend بلا شبكة.
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

// PNG شفّاف 1×1 صالح
const PNG_1PX = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

describe("البريد + الهوية البصرية (e2e)", () => {
  let app: INestApplication;
  const srv = () => app.getHttpServer();
  const uniq = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function newOwner(): Promise<{ token: string; tenantId: string }> {
    const res = await request(srv()).post("/signup").send({ companyName: `براند ${uniq()}`, adminName: "مالك", adminEmail: `br-${uniq()}@brk.sa`, password: "Owner1Pass" }).expect(201);
    return { token: res.body.accessToken, tenantId: res.body.tenant.id };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  afterAll(async () => { await app?.close(); });

  // ————————————————— P0-B: الهوية البصرية —————————————————

  it("الهوية الافتراضية = هوية NX-IBP (لون teal، بلا شعار)", async () => {
    const { token } = await newOwner();
    const b = (await request(srv()).get("/branding").set(auth(token)).expect(200)).body;
    expect(b.primary).toBe("#0d9488");
    expect(b.logoUrl).toBeNull();
    expect(b.logoText).toBe("IBP");
  });

  it("حفظ لون/اسم عرض ⇒ ينعكس في GET /branding", async () => {
    const { token } = await newOwner();
    await request(srv()).put("/config/branding").set(auth(token)).send({ primary: "#123456", displayName: "شركتي للوساطة" }).expect(200);
    const b = (await request(srv()).get("/branding").set(auth(token)).expect(200)).body;
    expect(b.primary).toBe("#123456");
    expect(b.displayName).toBe("شركتي للوساطة");
  });

  it("لون غير صالح (ليس hex) ⇒ 400", async () => {
    const { token } = await newOwner();
    await request(srv()).put("/config/branding").set(auth(token)).send({ primary: "red" }).expect(400);
  });

  it("رفع شعار ⇒ رابط عام ثابت يخدمه بلا مصادقة", async () => {
    const { token, tenantId } = await newOwner();
    const res = await request(srv()).post("/config/branding/logo").set(auth(token)).send({ dataUrl: PNG_1PX }).expect(200);
    expect(res.body.logoUrl).toContain(`/branding/${tenantId}/logo`);
    // الرابط العام يخدم الصورة بلا توكن
    const img = await request(srv()).get(`/branding/${tenantId}/logo`).expect(200);
    expect(img.headers["content-type"]).toContain("image/png");
  });

  it("رفع صيغة غير مدعومة ⇒ 400", async () => {
    const { token } = await newOwner();
    await request(srv()).post("/config/branding/logo").set(auth(token)).send({ dataUrl: "data:text/plain;base64,aGVsbG8=" }).expect(400);
  });

  it("عزل: هوية مستأجر لا تظهر لغيره", async () => {
    const a = await newOwner();
    await request(srv()).put("/config/branding").set(auth(a.token)).send({ primary: "#abcdef" }).expect(200);
    const b = await newOwner();
    const bb = (await request(srv()).get("/branding").set(auth(b.token)).expect(200)).body;
    expect(bb.primary).toBe("#0d9488"); // الافتراضي، لا لون المستأجر أ
  });

  it("موظف بلا صلاحية الإعدادات ⇒ 403 على تعديل الهوية", async () => {
    const { token } = await newOwner();
    const email = `st-${uniq()}@brk.sa`;
    await request(srv()).post("/staff").set(auth(token)).send({ fullName: "موظف", email, password: "Worker1Pass", roleName: "بلا إعدادات", permissions: [{ module: "clients", canAccess: true, canCreate: false, canEdit: false, canDelete: false }] }).expect(201);
    const staff = (await request(srv()).post("/auth/login").send({ email, password: "Worker1Pass" })).body.accessToken;
    await request(srv()).put("/config/branding").set(auth(staff)).send({ primary: "#000000" }).expect(403);
  });

  // ————————————————— P0-A: البريد متعدّد المستأجرين —————————————————

  it("بلا إعداد ⇒ الحالة unconfigured ووضع fallback بلا كشف مفتاح", async () => {
    const { token } = await newOwner();
    const e = (await request(srv()).get("/config/email").set(auth(token)).expect(200)).body;
    expect(e.verificationStatus).toBe("unconfigured");
    expect(e.sendingMode).toBe("fallback");
    expect(e.hasApiKey).toBe(false);
    expect(e.apiKeyMasked).toBeNull();
    expect(e.fallbackFrom).toBeTruthy();
  });

  it("حفظ وربط ⇒ pending + fallback + DNS معروضة + مفتاح masked لا خام", async () => {
    const { token } = await newOwner();
    const e = (await request(srv()).put("/config/email").set(auth(token)).send({ fromEmail: "noreply@mybroker.sa", fromName: "وساطتي", apiKey: "re_testkey123456" }).expect(200)).body;
    expect(e.verificationStatus).toBe("pending");
    expect(e.sendingMode).toBe("fallback"); // لا انقطاع — يبقى fallback حتى التحقّق
    expect(e.domain).toBe("mybroker.sa");
    expect(e.hasApiKey).toBe(true);
    expect(e.apiKeyMasked).toMatch(/•+/);
    expect(JSON.stringify(e)).not.toContain("re_testkey123456"); // لا يُكشف المفتاح الخام أبدًا
    expect(Array.isArray(e.dnsRecords) && e.dnsRecords.length).toBeGreaterThan(0);
  });

  it("بريد غير صحيح ⇒ 400", async () => {
    const { token } = await newOwner();
    await request(srv()).put("/config/email").set(auth(token)).send({ fromEmail: "not-an-email", fromName: "x", apiKey: "re_k" }).expect(400);
  });

  it("وضع الردود فقط: حفظ بلا مفتاح Resend ⇒ 200 (إرسال مركزي + Reply-To بريد الشركة)", async () => {
    const { token } = await newOwner();
    const e = (await request(srv()).put("/config/email").set(auth(token)).send({ fromEmail: "office@small-broker.sa", fromName: "مكتب صغير" }).expect(200)).body;
    expect(e.fromEmail).toBe("office@small-broker.sa");
    expect(e.hasApiKey).toBe(false); // بلا مفتاح — يبقى الإرسال مركزيًّا
    expect(e.sendingMode).toBe("fallback");
    expect(e.verificationStatus).toBe("unconfigured");
  });

  it("تحقّق الآن ⇒ الترقية التلقائية لوضع tenant (Sandbox)", async () => {
    const { token } = await newOwner();
    await request(srv()).put("/config/email").set(auth(token)).send({ fromEmail: "noreply@verify-me.sa", fromName: "موثّق", apiKey: "re_verifykey" }).expect(200);
    const v = (await request(srv()).post("/config/email/verify").set(auth(token)).expect(200)).body;
    expect(v.verificationStatus).toBe("verified");
    expect(v.sendingMode).toBe("tenant"); // ترقية آلية دون تدخل
    expect(v.lastVerifiedAt).toBeTruthy();
  });

  it("موظف بلا صلاحية الإعدادات ⇒ 403 على إعداد البريد", async () => {
    const { token } = await newOwner();
    const email = `em-${uniq()}@brk.sa`;
    await request(srv()).post("/staff").set(auth(token)).send({ fullName: "موظف", email, password: "Worker1Pass", roleName: "بلا إعدادات2", permissions: [{ module: "clients", canAccess: true, canCreate: false, canEdit: false, canDelete: false }] }).expect(201);
    const staff = (await request(srv()).post("/auth/login").send({ email, password: "Worker1Pass" })).body.accessToken;
    await request(srv()).get("/config/email").set(auth(staff)).expect(403);
    await request(srv()).put("/config/email").set(auth(staff)).send({ fromEmail: "a@b.sa", fromName: "x", apiKey: "re_k" }).expect(403);
  });

  // ————————————————— بيانات الشركة (Company) —————————————————

  it("بيانات الشركة: قراءة الاسم من التسجيل ثم حفظ حقول مُتحقَّقة", async () => {
    const email = `co-${uniq()}@brk.sa`;
    const signup = await request(srv()).post("/signup").send({ companyName: "شركة الاسم الأصلي", adminName: "المالك", adminEmail: email, password: "Owner1Pass" }).expect(201);
    const token = signup.body.accessToken;
    const before = (await request(srv()).get("/config/company").set(auth(token)).expect(200)).body;
    expect(before.name).toBe("شركة الاسم الأصلي");
    const saved = (await request(srv()).put("/config/company").set(auth(token)).send({ nameEn: "New Broker Co", unifiedNumber: "7001234567", vatNumber: "300012345600003", phone: "0551234567" }).expect(200)).body;
    expect(saved.nameEn).toBe("New Broker Co");
    expect(saved.unifiedNumber).toBe("7001234567");
    expect(saved.vatNumber).toBe("300012345600003");
  });

  it("بيانات الشركة: رقم موحّد بغير 10 أرقام ⇒ 400", async () => {
    const { token } = await newOwner();
    await request(srv()).put("/config/company").set(auth(token)).send({ unifiedNumber: "123" }).expect(400);
  });

  it("موظف بلا صلاحية الإعدادات ⇒ 403 على تعديل بيانات الشركة", async () => {
    const { token } = await newOwner();
    const email = `coemp-${uniq()}@brk.sa`;
    await request(srv()).post("/staff").set(auth(token)).send({ fullName: "موظف", email, password: "Worker1Pass", roleName: `بلا إعدادات ${uniq()}`, permissions: [{ module: "clients", canAccess: true, canCreate: false, canEdit: false, canDelete: false }] }).expect(201);
    const staff = (await request(srv()).post("/auth/login").send({ email, password: "Worker1Pass" })).body.accessToken;
    await request(srv()).put("/config/company").set(auth(staff)).send({ nameEn: "X" }).expect(403);
  });
});
