/**
 * اختبار مكتبة قوالب النماذج — بند التحسين الأخير:
 *  - RBAC: تحت وحدة المبيعات (نطاق إنشاء الطلبات).
 *  - إنشاء/سرد حسب الخطّ/تطبيق (يزيد عدّاد الاستخدام ويعيد التعبئة)/حذف.
 *  - رفض خطّ منتج غير موجود · العزل بين المستأجرين.
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

describe("مكتبة قوالب النماذج (e2e)", () => {
  let app: INestApplication;
  let gm: string; // مبيعات (إنشاء)
  let accountant: string; // مالية بلا مبيعات
  let amanGm: string;

  const login = async (email: string) =>
    (await request(app.getHttpServer()).post("/auth/login").send({ email, password: "Passw0rd!" })).body.accessToken as string;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const TPL = { name: "طبي قياسي", productLineCode: "SME", description: "شبكة قياسية", base: { network: "standard", annualLimit: 500000, currency: "SAR" } };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    gm = await login("waleed@gulf-demo.sa");
    accountant = await login("laila@gulf-demo.sa");
    amanGm = await login("omar@aman-demo.sa");
  });

  afterAll(async () => {
    await app?.close();
  });

  it("غير المبيعات (المحاسب) ممنوع من إنشاء قالب ⇒ 403", async () => {
    await request(app.getHttpServer()).post("/form-templates").set(auth(accountant)).send(TPL).expect(403);
  });

  it("خطّ منتج غير موجود ⇒ 400", async () => {
    await request(app.getHttpServer()).post("/form-templates").set(auth(gm)).send({ ...TPL, productLineCode: "ZZZ" }).expect(400);
  });

  it("إنشاء قالب ⇒ 201، ويظهر في قائمة الخطّ", async () => {
    const tpl = (await request(app.getHttpServer()).post("/form-templates").set(auth(gm)).send(TPL).expect(201)).body;
    expect(tpl.id).toBeTruthy();
    expect(tpl.productLineCode).toBe("SME");
    const list = (await request(app.getHttpServer()).get("/form-templates?line=SME").set(auth(gm)).expect(200)).body;
    expect(list.some((t: { id: string }) => t.id === tpl.id)).toBe(true);
    // خطّ آخر لا يُظهره
    const other = (await request(app.getHttpServer()).get("/form-templates?line=MFL").set(auth(gm)).expect(200)).body;
    expect(other.some((t: { id: string }) => t.id === tpl.id)).toBe(false);
  });

  it("تطبيق القالب يعيد التعبئة ويزيد عدّاد الاستخدام", async () => {
    const tpl = (await request(app.getHttpServer()).post("/form-templates").set(auth(gm)).send(TPL).expect(201)).body;
    const a1 = (await request(app.getHttpServer()).post(`/form-templates/${tpl.id}/apply`).set(auth(gm)).expect(201)).body;
    expect(a1.base.network).toBe("standard");
    expect(a1.base.annualLimit).toBe(500000);
    expect(a1.productLineCode).toBe("SME");
    // تطبيق ثانٍ ⇒ العدّاد ≥ 2
    await request(app.getHttpServer()).post(`/form-templates/${tpl.id}/apply`).set(auth(gm)).expect(201);
    const fetched = (await request(app.getHttpServer()).get(`/form-templates/${tpl.id}`).set(auth(gm)).expect(200)).body;
    expect(fetched.usageCount).toBeGreaterThanOrEqual(2);
  });

  it("تحديث وحذف القالب", async () => {
    const tpl = (await request(app.getHttpServer()).post("/form-templates").set(auth(gm)).send(TPL).expect(201)).body;
    const upd = (await request(app.getHttpServer()).patch(`/form-templates/${tpl.id}`).set(auth(gm)).send({ name: "طبي مُحدَّث" }).expect(200)).body;
    expect(upd.name).toBe("طبي مُحدَّث");
    await request(app.getHttpServer()).delete(`/form-templates/${tpl.id}`).set(auth(gm)).expect(200);
    await request(app.getHttpServer()).get(`/form-templates/${tpl.id}`).set(auth(gm)).expect(404);
  });

  it("بوّابة الباقة + العزل: مستأجر الأمان (basic بلا ميزة القوالب) ممنوع ⇒ 403", async () => {
    const gulf = (await request(app.getHttpServer()).post("/form-templates").set(auth(gm)).send(TPL).expect(201)).body;
    // الأمان على باقة أساسية لا تشمل feature.formTemplates ⇒ لا وصول (يمنع رؤية قوالب الخليج)
    await request(app.getHttpServer()).get("/form-templates?line=SME").set(auth(amanGm)).expect(403);
    await request(app.getHttpServer()).post(`/form-templates/${gulf.id}/apply`).set(auth(amanGm)).expect(403);
  });
});
