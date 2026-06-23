/**
 * اختبار الصلاحيات الصريح (تحقّق المرحلة 2):
 *  - موديول خارج الباقة ⇒ يُمنع بالـ API (entitlement).
 *  - موظف بلا صلاحية الدور ⇒ يُمنع (RBAC).
 *  - إنشاء موظف بمصفوفة صلاحيات ⇒ تُطبَّق فعلاً.
 * يتطلّب: pnpm db:seed.
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

describe("الصلاحيات RBAC + Entitlements (e2e)", () => {
  let app: INestApplication;
  const tokens: Record<string, string> = {};

  async function login(email: string, password = "Passw0rd!") {
    const res = await request(app.getHttpServer()).post("/auth/login").send({ email, password });
    return res.body.accessToken as string;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    tokens.gmGulf = await login("waleed@gulf-demo.sa"); // مدير عام — الخليج (premium + addon مطالبات)
    tokens.claimsGulf = await login("fahad@gulf-demo.sa"); // مسؤول مطالبات — الخليج
    tokens.accountantGulf = await login("laila@gulf-demo.sa"); // محاسبة — الخليج
    tokens.salesGulf = await login("sara@gulf-demo.sa"); // مدير مبيعات — الخليج
    tokens.gmAman = await login("omar@aman-demo.sa"); // مدير عام — الأمان (basic)
  });

  afterAll(async () => {
    await app?.close();
  });

  // ----- بوابة الـ Entitlement (الباقة) -----
  it("الأمان (basic) ممنوع من /claims — الموديول خارج الباقة ⇒ 403", () =>
    request(app.getHttpServer()).get("/claims").set("Authorization", `Bearer ${tokens.gmAman}`).expect(403));

  it("الخليج (premium + addon) مسموح بـ /claims لمسؤول المطالبات ⇒ 200", () =>
    request(app.getHttpServer()).get("/claims").set("Authorization", `Bearer ${tokens.claimsGulf}`).expect(200));

  it("المدير العام (الخليج) مسموح بـ /claims ⇒ 200", () =>
    request(app.getHttpServer()).get("/claims").set("Authorization", `Bearer ${tokens.gmGulf}`).expect(200));

  // ----- بوابة الـ RBAC (الدور) -----
  it("المحاسبة ممنوعة من /clients — لا صلاحية للموديول ⇒ 403", () =>
    request(app.getHttpServer()).get("/clients").set("Authorization", `Bearer ${tokens.accountantGulf}`).expect(403));

  it("المحاسبة ممنوعة من /claims (RBAC) رغم تفعيل الباقة ⇒ 403", () =>
    request(app.getHttpServer()).get("/claims").set("Authorization", `Bearer ${tokens.accountantGulf}`).expect(403));

  it("المدير العام مسموح بـ /clients ⇒ 200", () =>
    request(app.getHttpServer()).get("/clients").set("Authorization", `Bearer ${tokens.gmGulf}`).expect(200));

  // ----- إدارة الموظفين (settings) -----
  it("مدير المبيعات ممنوع من /staff (لا صلاحية settings) ⇒ 403", () =>
    request(app.getHttpServer()).get("/staff").set("Authorization", `Bearer ${tokens.salesGulf}`).expect(403));

  it("المدير العام يرى /staff ⇒ 200", () =>
    request(app.getHttpServer()).get("/staff").set("Authorization", `Bearer ${tokens.gmGulf}`).expect(200));

  it("مدير المبيعات ممنوع من إنشاء موظف ⇒ 403", () =>
    request(app.getHttpServer())
      .post("/staff")
      .set("Authorization", `Bearer ${tokens.salesGulf}`)
      .send({ fullName: "x", email: "x@gulf-demo.sa", password: "Passw0rd!", roleName: "r", permissions: [] })
      .expect(403));

  it("المدير العام ينشئ موظفاً بمصفوفة صلاحيات، وتُطبَّق فعلاً", async () => {
    const email = `newhire-${Date.now()}@gulf-demo.sa`;
    const create = await request(app.getHttpServer())
      .post("/staff")
      .set("Authorization", `Bearer ${tokens.gmGulf}`)
      .send({
        fullName: "موظف عملاء جديد",
        email,
        password: "Passw0rd!",
        roleName: "موظف عملاء",
        permissions: [
          { module: "dashboard", canAccess: true, canCreate: false, canEdit: false, canDelete: false },
          { module: "clients", canAccess: true, canCreate: false, canEdit: false, canDelete: false },
        ],
      })
      .expect(201);
    expect(create.body.email).toBe(email);
    expect(create.body.tenantId).toBe("demo-tenant");

    // الموظف الجديد: يصل للعملاء (مُنح) لكنه ممنوع من إدارة الموظفين (لم يُمنح settings)
    const token = await login(email);
    await request(app.getHttpServer()).get("/clients").set("Authorization", `Bearer ${token}`).expect(200);
    await request(app.getHttpServer()).get("/staff").set("Authorization", `Bearer ${token}`).expect(403);
  });
});
