/**
 * اختبار لوحة السوبر أدمن (تحقّق المرحلة 8أ):
 *  - السوبر أدمن يرى كل المستأجرين (عابر للعزل) ويدير الباقات والاستخدام.
 *  - مستخدم المستأجر لا يصل للوحة المنصّة، والسوبر أدمن لا يصل لمسارات المستأجر.
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

describe("لوحة السوبر أدمن (e2e)", () => {
  let app: INestApplication;
  let platform: string; // سوبر أدمن
  let tenantUser: string; // مستخدم مستأجر

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    platform = (await request(app.getHttpServer()).post("/platform/login").send({ email: "admin@ibp-platform.sa", password: "Passw0rd!" })).body.accessToken;
    tenantUser = (await request(app.getHttpServer()).post("/auth/login").send({ email: "waleed@gulf-demo.sa", password: "Passw0rd!" })).body.accessToken;
  });

  afterAll(async () => {
    await app?.close();
  });

  it("دخول السوبر أدمن يُصدر توكناً", () => expect(platform).toBeTruthy());

  it("كلمة مرور خاطئة للسوبر أدمن ⇒ 401", () =>
    request(app.getHttpServer()).post("/platform/login").send({ email: "admin@ibp-platform.sa", password: "wrong" }).expect(401));

  it("السوبر أدمن يرى كل المستأجرين (عابر للعزل)", async () => {
    const res = await request(app.getHttpServer()).get("/platform/tenants").set(auth(platform)).expect(200);
    const ids = res.body.map((t: { id: string }) => t.id);
    expect(ids).toEqual(expect.arrayContaining(["demo-tenant", "demo-tenant-2"]));
    expect(res.body.find((t: { id: string }) => t.id === "demo-tenant").subscription.plan.code).toBe("enterprise");
  });

  it("السوبر أدمن يطّلع على الشركات المسجّلة ذاتيًا ومالكها (سوبر أدمن الشركة)", async () => {
    const email = `plat-owner-${Date.now()}@brk.sa`;
    const signup = await request(app.getHttpServer()).post("/signup").send({ companyName: "شركة مرئية للمنصة", adminName: "المالك المرئي", adminEmail: email, password: "Owner1Pass" }).expect(201);
    const tenantId = signup.body.tenant.id;

    const list = await request(app.getHttpServer()).get("/platform/tenants").set(auth(platform)).expect(200);
    const row = list.body.find((t: { id: string }) => t.id === tenantId);
    expect(row.owner.email).toBe(email);

    const detail = await request(app.getHttpServer()).get(`/platform/tenants/${tenantId}`).set(auth(platform)).expect(200);
    expect(detail.body.owner.email).toBe(email);
    expect(detail.body.users[0].email).toBe(email);
    expect(detail.body.users[0].role.name).toBe("المدير العام"); // مالك الشركة = المدير العام (كل الصلاحيات)
  });

  it("مستخدم المستأجر ممنوع من لوحة المنصّة ⇒ 403", () =>
    request(app.getHttpServer()).get("/platform/tenants").set(auth(tenantUser)).expect(403));

  it("السوبر أدمن ممنوع من مسارات المستأجر (لا نطاق مستأجر) ⇒ 403", () =>
    request(app.getHttpServer()).get("/clients").set(auth(platform)).expect(403));

  it("استخدام المنصّة عبر كل المستأجرين", async () => {
    const res = await request(app.getHttpServer()).get("/platform/usage").set(auth(platform)).expect(200);
    expect(res.body.tenants).toBeGreaterThanOrEqual(2);
    expect(res.body.clients).toBeGreaterThanOrEqual(7);
  });

  it("السوبر أدمن يضبط entitlement لباقة (قابلية التهيئة)", async () => {
    const res = await request(app.getHttpServer()).post("/platform/plans/basic/entitlements").set(auth(platform))
      .send({ featureKey: "upload.maxFileMb", mode: "QUOTA", numericValue: 15 }).expect(200);
    expect(Number(res.body.numericValue)).toBe(15);
  });

  it("طلبات التواصل (Leads): السوبر أدمن يراها ويحدّث حالتها؛ والإرسال المتكرّر لا يُقفَل", async () => {
    const email = `lead-plat-${Date.now()}@corp.sa`;
    // إرسالان سريعان بنفس البريد ⇒ لا يُقفَل، ويُعاد نفس المعرّف (idempotent خلال 60 ثانية)
    const a = await request(app.getHttpServer()).post("/signup/lead").send({ name: "مؤسسة كبيرة", email, company: "شركة", planCode: "enterprise", seats: 120 }).expect(201);
    const b = await request(app.getHttpServer()).post("/signup/lead").send({ name: "مؤسسة كبيرة", email, company: "شركة", planCode: "enterprise", seats: 120 }).expect(201);
    expect(b.body.id).toBe(a.body.id);
    // السوبر أدمن يرى الطلب
    const leads = (await request(app.getHttpServer()).get("/platform/leads").set(auth(platform)).expect(200)).body as Array<{ id: string; email: string; status: string }>;
    const row = leads.find((l) => l.id === a.body.id);
    expect(row).toBeTruthy();
    expect(row!.status).toBe("new");
    // تحديث الحالة ⇒ contacted
    await request(app.getHttpServer()).post(`/platform/leads/${a.body.id}/status`).set(auth(platform)).send({ status: "contacted" }).expect(200);
    const after = (await request(app.getHttpServer()).get("/platform/leads").set(auth(platform)).expect(200)).body as Array<{ id: string; status: string }>;
    expect(after.find((l) => l.id === a.body.id)!.status).toBe("contacted");
    // مستخدم مستأجر ممنوع من طلبات المنصّة ⇒ 403
    await request(app.getHttpServer()).get("/platform/leads").set(auth(tenantUser)).expect(403);
    // حالة غير معروفة ⇒ 400
    await request(app.getHttpServer()).post(`/platform/leads/${a.body.id}/status`).set(auth(platform)).send({ status: "nope" }).expect(400);
  });

  it("الدخول كالحساب (انتحال): السوبر أدمن يُصدر توكن مستأجر موسوم؛ /auth/me يكشف الجلسة؛ ويعمل بصلاحية المالك", async () => {
    const res = await request(app.getHttpServer()).post("/platform/tenants/demo-tenant/impersonate").set(auth(platform)).expect(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.actingAs.email).toBe("waleed@gulf-demo.sa");
    const impToken = res.body.accessToken as string;
    // /auth/me على توكن الانتحال يكشف الجلسة (اسم الحساب + بريد المشرف) — للبانر
    const me = (await request(app.getHttpServer()).get("/auth/me").set(auth(impToken)).expect(200)).body;
    expect(me.impersonation).toBeTruthy();
    expect(me.impersonation.tenantId).toBe("demo-tenant");
    expect(me.impersonation.adminEmail).toBe("admin@ibp-platform.sa");
    // يعمل بصلاحية مستأجر demo-tenant (قراءة عملاء الحساب)
    await request(app.getHttpServer()).get("/clients").set(auth(impToken)).expect(200);
    // جلسة عادية (بلا انتحال) ⇒ impersonation = null
    const meNormal = (await request(app.getHttpServer()).get("/auth/me").set(auth(tenantUser)).expect(200)).body;
    expect(meNormal.impersonation).toBeNull();
  });

  it("مستخدم المستأجر ممنوع من الانتحال (مسار منصّة) ⇒ 403", () =>
    request(app.getHttpServer()).post("/platform/tenants/demo-tenant/impersonate").set(auth(tenantUser)).expect(403));

  it("تغيير باقة مستأجر: يسري فورًا على الميزات (basic ⇒ premium يفتح ZATCA)", async () => {
    const email = `plan-${Date.now()}@brk.sa`;
    const signup = await request(app.getHttpServer()).post("/signup").send({ companyName: "شركة تغيير الباقة", adminName: "المالك", adminEmail: email, password: "Owner1Pass" }).expect(201);
    const tId = signup.body.tenant.id; const tAuth = { Authorization: `Bearer ${signup.body.accessToken}` };
    // basic ⇒ ZATCA محجوبة
    await request(app.getHttpServer()).get("/zatca/config").set(tAuth).expect(403);
    // السوبر أدمن يرفع الباقة إلى premium ⇒ تُتاح فورًا
    const res = await request(app.getHttpServer()).put(`/platform/tenants/${tId}/plan`).set(auth(platform)).send({ planCode: "premium" }).expect(200);
    expect(res.body.planCode).toBe("premium");
    await request(app.getHttpServer()).get("/zatca/config").set(tAuth).expect(200);
    // تفاصيل المستأجر تعكس الباقة الجديدة
    const detail = (await request(app.getHttpServer()).get(`/platform/tenants/${tId}`).set(auth(platform)).expect(200)).body;
    expect(detail.subscription.plan.code).toBe("premium");
  });

  it("ضبط/تمديد تاريخ التجديد: يضبط ACTIVE + renewsAt مستقبلي ويظهر في رؤية الانتهاء", async () => {
    const email = `renew-${Date.now()}@brk.sa`;
    const signup = await request(app.getHttpServer()).post("/signup").send({ companyName: "شركة التمديد", adminName: "المالك", adminEmail: email, password: "Owner1Pass" }).expect(201);
    const tId = signup.body.tenant.id;
    const res = await request(app.getHttpServer()).post(`/platform/tenants/${tId}/renewal`).set(auth(platform)).send({ months: 3 }).expect(200);
    expect(res.body.status).toBe("ACTIVE");
    expect(new Date(res.body.renewsAt).getTime()).toBeGreaterThan(Date.now());
    // القائمة تعرض حالة الوصول (رؤية الانتهاء)
    const list = (await request(app.getHttpServer()).get("/platform/tenants").set(auth(platform)).expect(200)).body as Array<{ id: string; access?: { state: string; endsAt: string | null } }>;
    const row = list.find((r) => r.id === tId);
    expect(row?.access?.state).toBe("active");
    expect(row?.access?.endsAt).toBeTruthy();
  });

  it("السوبر أدمن يعلّق ويعيد تفعيل مستأجر", async () => {
    const s = await request(app.getHttpServer()).post("/platform/tenants/demo-tenant-2/status").set(auth(platform)).send({ status: "SUSPENDED" }).expect(200);
    expect(s.body.status).toBe("SUSPENDED");
    await request(app.getHttpServer()).post("/platform/tenants/demo-tenant-2/status").set(auth(platform)).send({ status: "ACTIVE" }).expect(200);
  });

  // بوّابة الميزة عبر الباقة: ZATCA (مالية متقدّمة) خارج الأساسية افتراضيًا؛ تفعيلها من السوبر أدمن يتيح الوصول فورًا
  it("تفعيل/تعطيل feature.zatca لباقة يفرض الوصول فعليًا على مستأجرها (توأم شريحة السوبر أدمن)", async () => {
    // مستأجر جديد على الباقة الأساسية (ZATCA خارج الأساسية افتراضيًا)
    const email = `zt-${Date.now()}@brk.sa`;
    const signup = await request(app.getHttpServer()).post("/signup").send({ companyName: "شركة اختبار الميزة", adminName: "المالك", adminEmail: email, password: "Owner1Pass" }).expect(201);
    const tAuth = { Authorization: `Bearer ${signup.body.accessToken}` };

    // خارج الباقة ⇒ يُرفَض الوصول لتهيئة ZATCA (403)
    await request(app.getHttpServer()).get("/zatca/config").set(tAuth).expect(403);
    try {
      // السوبر أدمن يُفعّل الميزة للباقة ⇒ يُتاح الوصول فورًا (entitlement)
      await request(app.getHttpServer()).post("/platform/plans/basic/entitlements").set(auth(platform)).send({ featureKey: "feature.zatca", mode: "INCLUDED" }).expect(200);
      await request(app.getHttpServer()).get("/zatca/config").set(tAuth).expect(200);
    } finally {
      // استعادة الافتراضي (خارج الباقة الأساسية) كي لا تتأثّر بقيّة الاختبارات
      await request(app.getHttpServer()).post("/platform/plans/basic/entitlements").set(auth(platform)).send({ featureKey: "feature.zatca", mode: "DISABLED" });
    }
    // بعد الاستعادة ⇒ يعود المنع
    await request(app.getHttpServer()).get("/zatca/config").set(tAuth).expect(403);
  });
});
