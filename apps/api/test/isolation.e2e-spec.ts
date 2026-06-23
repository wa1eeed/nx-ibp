/**
 * اختبار العزل الصريح (تحقّق المرحلة 1):
 * مستخدم من مستأجر لا يرى بيانات مستأجر آخر إطلاقاً.
 * يتطلّب قاعدة مزروعة: pnpm db:seed (مستأجران: الخليج/الأمان).
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

describe("عزل المستأجرين (e2e)", () => {
  let app: INestApplication;
  let tokenA: string; // الخليج — demo-tenant
  let tokenB: string; // الأمان — demo-tenant-2

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    const a = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "waleed@gulf-demo.sa", password: "Passw0rd!" });
    const b = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "omar@aman-demo.sa", password: "Passw0rd!" });
    tokenA = a.body.accessToken;
    tokenB = b.body.accessToken;
  });

  afterAll(async () => {
    await app?.close();
  });

  it("يُصدر توكناً صالحاً لكل مستأجر", () => {
    expect(tokenA).toBeTruthy();
    expect(tokenB).toBeTruthy();
  });

  it("يرفض /clients بلا توكن (401)", () => {
    return request(app.getHttpServer()).get("/clients").expect(401);
  });

  it("يرفض كلمة مرور خاطئة (401)", () => {
    return request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "waleed@gulf-demo.sa", password: "wrong-pass" })
      .expect(401);
  });

  it("المستأجر (أ) يرى عملاء مستأجره فقط", async () => {
    const res = await request(app.getHttpServer())
      .get("/clients")
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(5);
    expect(res.body.every((c: { tenantId: string }) => c.tenantId === "demo-tenant")).toBe(true);
    expect(res.body.some((c: { id: string }) => c.id === "cl-fahd")).toBe(true);
    expect(res.body.some((c: { id: string }) => c.id === "cl2-nukhba")).toBe(false);
  });

  it("المستأجر (ب) يرى عملاء مستأجره فقط", async () => {
    const res = await request(app.getHttpServer())
      .get("/clients")
      .set("Authorization", `Bearer ${tokenB}`)
      .expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    expect(res.body.every((c: { tenantId: string }) => c.tenantId === "demo-tenant-2")).toBe(true);
    expect(res.body.some((c: { id: string }) => c.id === "cl2-nukhba")).toBe(true);
  });

  it("لا يصل (أ) لعميل (ب) بالمعرّف ⇒ 404", () => {
    return request(app.getHttpServer())
      .get("/clients/cl2-nukhba")
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(404);
  });

  it("لا يصل (ب) لعميل (أ) بالمعرّف ⇒ 404", () => {
    return request(app.getHttpServer())
      .get("/clients/cl-fahd")
      .set("Authorization", `Bearer ${tokenB}`)
      .expect(404);
  });

  it("/auth/me يعيد مستأجر المستخدم الصحيح", async () => {
    const res = await request(app.getHttpServer())
      .get("/auth/me")
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);
    expect(res.body.tenantId).toBe("demo-tenant");
    expect(res.body.email).toBe("waleed@gulf-demo.sa");
  });
});
