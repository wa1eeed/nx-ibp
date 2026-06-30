/**
 * اختبار التحصين الأمني (Track G/P0):
 *  - حماية القوّة الغاشمة: قفل مؤقّت بعد محاولات دخول فاشلة متتالية ⇒ 429.
 *  - سياسة كلمات المرور: رفض كلمة ضعيفة عند إنشاء موظف ⇒ 400.
 *  - النجاح يُصفّر العدّاد (لا يضرّ الاستخدام المشروع).
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

describe("التحصين الأمني (e2e)", () => {
  let app: INestApplication;
  let gm: string;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    gm = (await request(app.getHttpServer()).post("/auth/login").send({ email: "waleed@gulf-demo.sa", password: "Passw0rd!" })).body.accessToken;
  });
  afterAll(async () => { await app?.close(); });

  it("حماية القوّة الغاشمة: قفل بعد محاولات فاشلة ⇒ 429", async () => {
    const email = `bruteforce-${Date.now()}@x.sa`; // بريد وهمي معزول — لا يمسّ الحسابات الحقيقية
    const pw = "WrongPassword1"; // صيغة صحيحة لكن خاطئة ⇒ تصل لفحص بيانات الدخول (401)
    const srv = app.getHttpServer();
    for (let i = 0; i < 8; i++) {
      await request(srv).post("/auth/login").send({ email, password: pw }).expect(401);
    }
    await request(srv).post("/auth/login").send({ email, password: pw }).expect(429); // مقفل الآن
  });

  it("الدخول الناجح لا يتأثّر (العدّاد يُصفّر)", () =>
    request(app.getHttpServer()).post("/auth/login").send({ email: "waleed@gulf-demo.sa", password: "Passw0rd!" }).expect(201));

  it("سياسة كلمات المرور: كلمة ضعيفة ⇒ 400", () =>
    request(app.getHttpServer()).post("/staff").set(auth(gm))
      .send({ fullName: "موظف", email: `weak-${Date.now()}@gulf-demo.sa`, password: "weak", roleName: "قسم", permissions: [] })
      .expect(400));

  it("سياسة كلمات المرور: كلمة قوية مقبولة", () =>
    request(app.getHttpServer()).post("/staff").set(auth(gm))
      .send({ fullName: "موظف قوي", email: `strong-${Date.now()}@gulf-demo.sa`, password: "Strong1Pass", roleName: "قسم الاختبار", permissions: [{ module: "clients", canAccess: true, canCreate: false, canEdit: false, canDelete: false }] })
      .expect(201));
});
