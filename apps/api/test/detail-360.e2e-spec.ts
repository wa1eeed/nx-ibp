/**
 * اختبار صفحات 360° — تحقّق:
 *  - نظرة العميل المجمّعة (/clients/:id/overview): بيانات + وثائق/مطالبات/طلبات + ملخّص.
 *  - تفاصيل الموظف (/staff/:id): بياناته + نشاطه (من التدقيق) + مؤشرات.
 *  - عزل: مستأجر آخر لا يقرأ نظرة عميل ليس له ⇒ 404.
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

describe("صفحات 360° (e2e)", () => {
  let app: INestApplication;
  let gm: string, omar: string;

  const login = async (email: string) => (await request(app.getHttpServer()).post("/auth/login").send({ email, password: "Passw0rd!" })).body.accessToken as string;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    gm = await login("waleed@gulf-demo.sa");
    omar = await login("omar@aman-demo.sa");
  });
  afterAll(async () => { await app?.close(); });

  it("نظرة العميل المجمّعة (cl-naseej) تحوي البيانات والمجاميع", async () => {
    const res = await request(app.getHttpServer()).get("/clients/cl-naseej/overview").set(auth(gm)).expect(200);
    expect(res.body.client.name).toBe("مجموعة نسيج القابضة");
    expect(res.body.summary.policies).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(res.body.policies)).toBe(true);
    expect(Array.isArray(res.body.activities)).toBe(true);
    expect(typeof res.body.summary.totalDue).toBe("number");
  });

  it("عزل: مستأجر آخر لا يقرأ نظرة عميل ليس له ⇒ 404", () =>
    request(app.getHttpServer()).get("/clients/cl-naseej/overview").set(auth(omar)).expect(404));

  it("تفاصيل الموظف تحوي دوره ونشاطه ومؤشراته", async () => {
    const staff = (await request(app.getHttpServer()).get("/staff").set(auth(gm)).expect(200)).body as Array<{ id: string }>;
    const res = await request(app.getHttpServer()).get(`/staff/${staff[0].id}`).set(auth(gm)).expect(200);
    expect(res.body.user.fullName).toBeTruthy();
    expect(res.body.user.role?.name).toBeTruthy();
    expect(Array.isArray(res.body.activity)).toBe(true);
    expect(res.body.stats.totalActions).toBeGreaterThanOrEqual(0);
  });
});
