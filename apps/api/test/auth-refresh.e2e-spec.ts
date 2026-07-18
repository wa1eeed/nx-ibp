/**
 * أمن (Track G) — رموز التحديث وتدوير الجلسة:
 *  - الدخول يُصدر **رمز وصول + رمز تحديث**.
 *  - `/auth/refresh` يبدّل رمز تحديث صالح بـ**وصول + تحديث جديدين**، ويُبطِل القديم (تدوير) ⇒ إعادة استخدامه 401.
 *  - `/auth/logout` يُبطِل رمز التحديث ⇒ تحديث لاحق 401.
 *  - رمز مجهول ⇒ 401 · أقصر من الحدّ ⇒ 400.
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

describe("أمن: رموز التحديث وتدوير الجلسة (e2e)", () => {
  let app: INestApplication;
  const srv = () => app.getHttpServer();
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const login = async () => (await request(srv()).post("/auth/login").send({ email: "waleed@gulf-demo.sa", password: "Passw0rd!" }).expect(201)).body;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  afterAll(async () => { await app?.close(); });

  it("الدخول يُصدر رمز وصول + رمز تحديث", async () => {
    const r = await login();
    expect(r.accessToken).toBeTruthy();
    expect(typeof r.refreshToken).toBe("string");
    expect(r.refreshToken.length).toBeGreaterThanOrEqual(32);
  });

  it("التدوير: رمز تحديث ⇒ وصول + تحديث جديدان، والقديم يُبطَل", async () => {
    const r = await login();
    const ref = (await request(srv()).post("/auth/refresh").send({ refreshToken: r.refreshToken }).expect(200)).body;
    expect(ref.accessToken).toBeTruthy();
    expect(ref.refreshToken).toBeTruthy();
    expect(ref.refreshToken).not.toBe(r.refreshToken);
    // رمز الوصول الجديد صالح على مسار محميّ
    await request(srv()).get("/auth/me").set(auth(ref.accessToken)).expect(200);
    // الرمز القديم لم يعد يُقبل (تدوير)
    await request(srv()).post("/auth/refresh").send({ refreshToken: r.refreshToken }).expect(401);
  });

  it("الخروج يُبطِل رمز التحديث", async () => {
    const r = await login();
    await request(srv()).post("/auth/logout").send({ refreshToken: r.refreshToken }).expect(200);
    await request(srv()).post("/auth/refresh").send({ refreshToken: r.refreshToken }).expect(401);
  });

  it("رمز مجهول ⇒ 401 · أقصر من الحدّ ⇒ 400", async () => {
    await request(srv()).post("/auth/refresh").send({ refreshToken: "a".repeat(48) }).expect(401);
    await request(srv()).post("/auth/refresh").send({ refreshToken: "short" }).expect(400);
  });
});
