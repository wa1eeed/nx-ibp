/**
 * فرض حالة الوصول (انتهاء التجربة / الإيقاف الإداري):
 *  - ACTIVE ⇒ قراءة + كتابة كاملة.
 *  - انتهاء التجربة ⇒ **قراءة فقط** (كتابة 402) + **خفض للباقة الأساسية** (feature.* المتقدّمة 403) + الفوترة/الدخول مستثناة.
 *  - SUSPENDED (سوبر أدمن) ⇒ **403** على كل شيء عدا الدخول/الفوترة؛ وإعادة التفعيل تُزيل الحجب فورًا.
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { TenantAccessService } from "../src/modules/access/tenant-access.service";

describe("فرض حالة الوصول (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessSvc: TenantAccessService;
  let platform: string;
  const srv = () => app.getHttpServer();
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const uniq = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  async function newOwner(): Promise<{ token: string; tenantId: string }> {
    const res = await request(srv()).post("/signup").send({ companyName: `وصول ${uniq()}`, adminName: "مالك", adminEmail: `ac-${uniq()}@brk.sa`, password: "Owner1Pass", seatCount: 25 }).expect(201);
    return { token: res.body.accessToken, tenantId: res.body.tenant.id };
  }
  /** يجعل تجربة المستأجر منتهية (يُرجِع بدء الاشتراك 30 يومًا للوراء) + يُبطل الكاش. */
  async function expireTrial(tenantId: string) {
    const past = new Date(); past.setDate(past.getDate() - 30);
    await prisma.subscription.updateMany({ where: { tenantId }, data: { startedAt: past } });
    accessSvc.invalidate(tenantId);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    accessSvc = app.get(TenantAccessService);
    platform = (await request(srv()).post("/platform/login").send({ email: "admin@ibp-platform.sa", password: "Passw0rd!" })).body.accessToken;
  });
  afterAll(async () => { await app?.close(); });

  it("تجربة سارية ⇒ قراءة وكتابة كاملة", async () => {
    const { token } = await newOwner();
    await request(srv()).get("/insurers").set(auth(token)).expect(200);
    await request(srv()).post("/insurers").set(auth(token)).send({ name: `مؤمِّن ${uniq()}` }).expect(201);
  });

  it("انتهاء التجربة ⇒ القراءة تعمل، الكتابة 402، والفوترة/الدخول مستثناة", async () => {
    const { token, tenantId } = await newOwner();
    await expireTrial(tenantId);
    // قراءة مسموحة
    await request(srv()).get("/insurers").set(auth(token)).expect(200);
    // كتابة على موديول أساسي ⇒ 402 (لا خطأ صلاحية — الموديول ضمن الأساسية)
    await request(srv()).post("/insurers").set(auth(token)).send({ name: `مرفوض ${uniq()}` }).expect(402);
    // الفوترة والدخول مستثناة (كي يستطيع الدفع)
    await request(srv()).get("/billing/seats").set(auth(token)).expect(200);
    await request(srv()).get("/auth/me").set(auth(token)).expect(200);
    // /auth/me يعكس الحالة
    const me = (await request(srv()).get("/auth/me").set(auth(token)).expect(200)).body;
    expect(me.access.state).toBe("trial_expired");
    expect(me.access.writeBlocked).toBe(true);
  });

  it("انتهاء التجربة ⇒ خفض للأساسية: ميزة متقدّمة (ZATCA) تُحجب 403 وتختفي من features", async () => {
    const { token, tenantId } = await newOwner();
    // قبل الانتهاء: إن كانت ضمن الباقة تُتاح (أو 403 إن خارجها أصلًا) — نتحقّق من الخفض بعد الانتهاء
    await expireTrial(tenantId);
    await request(srv()).get("/zatca/config").set(auth(token)).expect(403); // feature.zatca ليست في الأساسية
    const me = (await request(srv()).get("/auth/me").set(auth(token)).expect(200)).body;
    expect(me.features).not.toContain("feature.zatca");
  });

  it("الإيقاف الإداري (SUSPENDED) ⇒ 403 على كل شيء عدا المستثنى؛ وإعادة التفعيل تُزيل الحجب فورًا", async () => {
    const { token, tenantId } = await newOwner();
    await request(srv()).post(`/platform/tenants/${tenantId}/status`).set(auth(platform)).send({ status: "SUSPENDED" }).expect(200);
    // قراءة وكتابة محجوبتان (حجب كامل)
    await request(srv()).get("/insurers").set(auth(token)).expect(403);
    await request(srv()).post("/insurers").set(auth(token)).send({ name: "x" }).expect(403);
    // الدخول والفوترة مستثناة
    await request(srv()).get("/auth/me").set(auth(token)).expect(200);
    await request(srv()).get("/billing/seats").set(auth(token)).expect(200);
    // إعادة التفعيل ⇒ يعود الوصول فورًا (إبطال الكاش)
    await request(srv()).post(`/platform/tenants/${tenantId}/status`).set(auth(platform)).send({ status: "ACTIVE" }).expect(200);
    await request(srv()).get("/insurers").set(auth(token)).expect(200);
  });
});
