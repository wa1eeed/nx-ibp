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
    expect(res.body.find((t: { id: string }) => t.id === "demo-tenant").subscription.plan.code).toBe("premium");
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

  it("السوبر أدمن يعلّق ويعيد تفعيل مستأجر", async () => {
    const s = await request(app.getHttpServer()).post("/platform/tenants/demo-tenant-2/status").set(auth(platform)).send({ status: "SUSPENDED" }).expect(200);
    expect(s.body.status).toBe("SUSPENDED");
    await request(app.getHttpServer()).post("/platform/tenants/demo-tenant-2/status").set(auth(platform)).send({ status: "ACTIVE" }).expect(200);
  });
});
