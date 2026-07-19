/**
 * اختبار التسجيل الذاتي وتزويد المستأجر (B1):
 *  - ينشئ مستأجرًا كامل السقالة (اشتراك + دور مالك + مدير + شجرة حسابات) ويسجّل الدخول.
 *  - البريد فريد عالميًا (تكرار ⇒ 409). سياسة كلمات المرور (ضعيفة ⇒ 400). باقة مجهولة ⇒ 422.
 *  - المدير الجديد يصل فورًا لموديولاته، **ولا يرى بيانات مستأجر آخر** (العزل).
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

describe("التسجيل الذاتي (e2e)", () => {
  let app: INestApplication;
  const srv = () => app.getHttpServer();
  const uniq = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  afterAll(async () => { await app?.close(); });

  const payload = (over: Record<string, unknown> = {}) => ({
    companyName: "وساطة الاختبار", adminName: "المالك", adminEmail: `owner-${uniq()}@new-broker.sa`, password: "Owner1Pass", ...over,
  });

  it("تسجيل ناجح ⇒ مستأجر + توكن + دور مالك", async () => {
    const res = await request(srv()).post("/signup").send(payload()).expect(201);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.tenant.status).toBe("TRIAL");
    expect(res.body.tenant.plan).toBe("basic");
    expect(res.body.user.tenantId).toBe(res.body.tenant.id);
    expect(res.body.user.roleId).toBeTruthy();
  });

  it("المدير الجديد يصل فورًا (شجرة الحسابات مزوّدة) ولا يرى بيانات غيره", async () => {
    const res = await request(srv()).post("/signup").send(payload()).expect(201);
    const token = res.body.accessToken;
    const auth = { Authorization: `Bearer ${token}` };

    // شجرة الحسابات مزوّدة (11 حسابًا قياسيًا) — وصول فوري لموديول المالية
    const coa = await request(srv()).get("/finance/coa").set(auth).expect(200);
    expect(Array.isArray(coa.body)).toBe(true);
    expect(coa.body.length).toBeGreaterThanOrEqual(11);

    // عزل: المستأجر الجديد لا عملاء لديه (لا يرى عملاء المستأجرين المبذورين)
    const clients = await request(srv()).get("/clients").set(auth).expect(200);
    expect(Array.isArray(clients.body)).toBe(true);
    expect(clients.body.length).toBe(0);
  });

  it("الحساب الجديد مزوّد بالأقسام السبعة + كل الأدوار المُعدّة مسبقًا (جاهز للتشغيل)", async () => {
    const res = await request(srv()).post("/signup").send(payload()).expect(201);
    const auth = { Authorization: `Bearer ${res.body.accessToken}` };

    // الأدوار المُعدّة مسبقًا (12) جاهزة بمصفوفة صلاحيات كل قسم
    const roles = (await request(srv()).get("/staff/roles").set(auth).expect(200)).body as Array<{ name: string; permissions: Array<{ module: string; canAccess: boolean; canCreate: boolean }> }>;
    expect(roles.length).toBeGreaterThanOrEqual(12);
    for (const nm of ["المدير العام", "مدير الالتزام", "مكتتب (مسؤول التسعير)", "المحاسب / مدير مالي", "مسؤول المطالبات"])
      expect(roles.some((r) => r.name === nm)).toBe(true);
    // صلاحيات القسم مضبوطة فعليًا: مكتتب لديه إنشاء الاكتتاب، وليس المالية
    const uw = roles.find((r) => r.name.includes("مكتتب"))!;
    expect(uw.permissions.find((p) => p.module === "underwriting")?.canCreate).toBe(true);
    expect(uw.permissions.find((p) => p.module === "finance")?.canAccess).toBe(false);

    // الهيكل التنظيمي: الإدارة العليا + الأقسام الستة جاهزة
    const tree = (await request(srv()).get("/org/departments").set(auth).expect(200)).body;
    const json = JSON.stringify(tree);
    for (const dept of ["الإدارة العليا", "المبيعات وتطوير الأعمال", "الالتزام والمطابقة", "الاكتتاب الفني", "الإدارة المالية والمحاسبة", "خدمة العملاء", "إدارة المطالبات"])
      expect(json.includes(dept)).toBe(true);
  });

  it("البريد المكرّر ⇒ 409", async () => {
    const p = payload();
    await request(srv()).post("/signup").send(p).expect(201);
    await request(srv()).post("/signup").send({ ...payload(), adminEmail: p.adminEmail }).expect(409);
  });

  it("كلمة مرور ضعيفة ⇒ 400", () =>
    request(srv()).post("/signup").send(payload({ password: "weak" })).expect(400));

  it("باقة مجهولة ⇒ 422", () =>
    request(srv()).post("/signup").send(payload({ planCode: "nope" })).expect(422));

  it("اسم شركة قصير ⇒ 400", () =>
    request(srv()).post("/signup").send(payload({ companyName: "ا" })).expect(400));

  // ——— كتالوج الباقات العام + الـOnboarding ———

  it("GET /signup/plans عام ⇒ سعر لكل مستخدم شهري/سنوي + التجربة + نسبة التوفير", async () => {
    const res = await request(srv()).get("/signup/plans").expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    const premium = res.body.find((p: { code: string }) => p.code === "premium");
    expect(premium).toBeTruthy();
    expect(typeof premium.pricePerUserMonthly).toBe("number");
    expect(typeof premium.pricePerUserYearly).toBe("number");
    expect(typeof premium.trialDays).toBe("number");
    expect(premium.savingsPct).toBeGreaterThan(0); // السنوي أوفر من الشهري×12
    expect(premium.seatLimit).toBeNull(); // بلا سقف مقاعد — التسعير لكل مستخدم فعلي
  });

  it("باقة المؤسسات لا تُتاح بالتسجيل الذاتي (بيع استشاري) ⇒ 422", () =>
    request(srv()).post("/signup").send(payload({ planCode: "enterprise", seatCount: 50 })).expect(422));

  it("تسجيل مع بيانات onboarding صحيحة (رقم موحّد/ضريبي/جوال + عدد مستخدمين + سنوي) ⇒ 201", async () => {
    const res = await request(srv()).post("/signup").send(payload({
      planCode: "premium", cycle: "YEARLY", seatCount: 8,
      unifiedNumber: "7001234567", vatNumber: "300012345600003", phone: "0551234567",
    })).expect(201);
    expect(res.body.tenant.plan).toBe("premium");
    // الاشتراك يعكس الدورة والمقاعد المختارة
    const auth = { Authorization: `Bearer ${res.body.accessToken}` };
    const sub = await request(srv()).get("/billing/subscription").set(auth).expect(200);
    expect(sub.body.subscription.cycle).toBe("YEARLY");
    expect(sub.body.subscription.seatsUsed).toBe(8);
  });

  it("الرقم الموحّد بغير 10 أرقام ⇒ 400", () =>
    request(srv()).post("/signup").send(payload({ unifiedNumber: "12345" })).expect(400));

  it("رقم جوال غير صحيح (لا يبدأ بـ05) ⇒ 400", () =>
    request(srv()).post("/signup").send(payload({ phone: "0491234567" })).expect(400));

  it("طلب تواصل مبيعات (Lead) عام ⇒ 201 + معرّف؛ بيانات ناقصة ⇒ 400", async () => {
    const r = await request(srv()).post("/signup/lead").send({ name: "شركة كبيرة", email: `lead-${uniq()}@corp.sa`, company: "مؤسسة الوساطة الكبرى", phone: "0559876543", planCode: "enterprise", seats: 120, message: "نحتاج عرضًا للمؤسسات" }).expect(201);
    expect(r.body.ok).toBe(true);
    expect(r.body.id).toBeTruthy();
    await request(srv()).post("/signup/lead").send({ name: "بلا بريد" }).expect(400); // بريد مطلوب
    await request(srv()).post("/signup/lead").send({ name: "ج", email: "not-an-email" }).expect(400);
  });

  it("عدد المستخدمين بلا سقف من الباقة (تسعير لكل مستخدم) — يُحفَظ كما اختاره العميل", async () => {
    const res = await request(srv()).post("/signup").send(payload({ planCode: "basic", seatCount: 40 })).expect(201);
    const auth = { Authorization: `Bearer ${res.body.accessToken}` };
    const sub = await request(srv()).get("/billing/subscription").set(auth).expect(200);
    expect(sub.body.subscription.seatsUsed).toBe(40); // لا يُقصَر — التسعير لكل مستخدم
  });
});
