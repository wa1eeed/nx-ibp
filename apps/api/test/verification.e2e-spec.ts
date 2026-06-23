/**
 * اختبار التحقّق الحكومي (تحقّق المرحلة 7):
 *  - سحب بيانات تجريبي يعبّئ النموذج (يقين/واثق/العنوان).
 *  - كل عملية مدفوعة تُخصم من المحفظة وتُسجَّل.
 *  - فحص PEP/العقوبات للالتزام. RBAC + عزل.
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

interface WalletRow { service: string; balance: number }

describe("التحقّق الحكومي KYC/KYB (e2e)", () => {
  let app: INestApplication;
  let sales: string; // مبيعات (clients:update ⇒ يحقّق)
  let compliance: string; // الالتزام (compliance:update ⇒ يفحص PEP)
  let accountant: string; // محاسب (clients '—' ⇒ ممنوع من التحقّق)
  let amanGm: string;

  const login = async (email: string) =>
    (await request(app.getHttpServer()).post("/auth/login").send({ email, password: "Passw0rd!" })).body.accessToken as string;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const balOf = async (token: string, service: string) => {
    const w = (await request(app.getHttpServer()).get("/verification/wallets").set(auth(token))).body as WalletRow[];
    return w.find((x) => x.service === service)?.balance ?? 0;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    sales = await login("sara@gulf-demo.sa");
    compliance = await login("huda@gulf-demo.sa");
    accountant = await login("laila@gulf-demo.sa");
    amanGm = await login("omar@aman-demo.sa");
  });

  afterAll(async () => {
    await app?.close();
  });

  it("يقين: سحب بيانات الهوية يعبّئ النموذج ويخصم عملية واحدة", async () => {
    const before = await balOf(sales, "yaqeen");
    const res = await request(app.getHttpServer()).post("/verification/yaqeen").set(auth(sales))
      .send({ nationalId: "1012345678", clientId: "cl-fahd" }).expect(200);
    expect(res.body.data.name).toBeTruthy();
    expect(res.body.data.idStatus).toBe("valid");
    expect(res.body.cost).toBe(3);
    const after = await balOf(sales, "yaqeen");
    expect(after).toBe(before - 1); // خُصمت عملية
  });

  it("المحاسب ممنوع من التحقّق (لا صلاحية clients) ⇒ 403", () =>
    request(app.getHttpServer()).post("/verification/yaqeen").set(auth(accountant)).send({ nationalId: "1012345678" }).expect(403));

  it("واثق: سحب بيانات السجل التجاري (الشركاء/المستفيد الحقيقي)", async () => {
    const res = await request(app.getHttpServer()).post("/verification/wathiq").set(auth(sales))
      .send({ crNumber: "1010101010", clientId: "cl-fahd" }).expect(200);
    expect(res.body.data.companyName).toBeTruthy();
    expect(Array.isArray(res.body.data.partners)).toBe(true);
    expect(res.body.data.ubo).toBeTruthy();
  });

  it("العنوان الوطني مجاني (لا خصم) ⇒ 200 cost=0", async () => {
    const before = await balOf(sales, "nafath");
    const res = await request(app.getHttpServer()).post("/verification/address").set(auth(sales)).send({ id: "1012345678" }).expect(200);
    expect(res.body.cost).toBe(0);
    expect(res.body.data.city).toBeTruthy();
    expect(await balOf(sales, "nafath")).toBe(before); // لا خصم
  });

  it("فحص PEP/العقوبات (الالتزام): اسم نظيف ⇒ low، مُعلَّم ⇒ high", async () => {
    const clean = await request(app.getHttpServer()).post("/verification/screening").set(auth(compliance)).send({ name: "أحمد الشهري" }).expect(200);
    expect(clean.body.riskLevel).toBe("low");
    const flagged = await request(app.getHttpServer()).post("/verification/screening").set(auth(compliance)).send({ name: "اسم تحت عقوبات" }).expect(200);
    expect(flagged.body.riskLevel).toBe("high");
  });

  it("المبيعات لا تملك فحص الالتزام ⇒ 403", () =>
    request(app.getHttpServer()).post("/verification/screening").set(auth(sales)).send({ name: "x" }).expect(403));

  it("العزل: الأمان لا يرى عمليات تحقّق الخليج", async () => {
    const res = await request(app.getHttpServer()).get("/verification/checks").set(auth(amanGm)).expect(200);
    expect(res.body.every((c: { tenantId: string }) => c.tenantId === "demo-tenant-2")).toBe(true);
  });
});
