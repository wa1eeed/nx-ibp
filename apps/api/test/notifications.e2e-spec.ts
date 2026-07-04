/**
 * اختبار نظام الإشعارات (H):
 *  - قائمة الأنواع (Email/SMS + نص) على مستويين: افتراضي المنصة وتخصيص الشركة.
 *  - تخصيص الشركة يتجاوز افتراضي المنصة؛ وافتراضي المنصة يُورَّث للحسابات بلا تخصيص.
 *  - العزل بين الشركات. نوع مجهول ⇒ 400. الصلاحية مطلوبة.
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

describe("نظام الإشعارات (e2e)", () => {
  let app: INestApplication;
  let platform: string;
  const srv = () => app.getHttpServer();
  const uniq = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const owner = async () => (await request(srv()).post("/signup").send({ companyName: `إشعار ${uniq()}`, adminName: "مالك", adminEmail: `nt-${uniq()}@brk.sa`, password: "Owner1Pass" }).expect(201)).body.accessToken;
  const find = (list: { eventKey: string }[], k: string) => list.find((x) => x.eventKey === k) as any;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    platform = (await request(srv()).post("/platform/login").send({ email: "admin@ibp-platform.sa", password: "Passw0rd!" })).body.accessToken;
  });
  afterAll(async () => { await app?.close(); });

  it("الشركة: قائمة كل الأنواع (عملاء + موظفين) بقنواتها ونصوصها", async () => {
    const t = await owner();
    const list = (await request(srv()).get("/notifications").set(auth(t)).expect(200)).body;
    expect(list.length).toBe(21); // 7 عملاء + 14 موظفين (إسناد مهمة/صفقة + تذكير مهمة مستحقّة)
    expect(find(list, "policy_issued").channelEmail).toBe(true);
    expect(find(list, "policy_issued").audience).toBe("client");
    expect(find(list, "tax_invoice").source).toBe("default"); // نوع لا يُخصَّص في هذا الملف ⇒ افتراضي النظام
    // إشعارات الموظفين حاضرة بجمهورها
    expect(find(list, "staff_claim_created").audience).toBe("staff");
    expect(find(list, "staff_policy_finance_review").audience).toBe("staff");
  });

  it("الشركة: تخصيص نوع (تعطيل SMS + تعديل النص)", async () => {
    const t = await owner();
    await request(srv()).put("/notifications/policy_issued").set(auth(t)).send({ channelEmail: true, channelSms: false, body: "تم إصدار وثيقتك {sequenceNo} — نص مخصّص" }).expect(200);
    const list = (await request(srv()).get("/notifications").set(auth(t)).expect(200)).body;
    const p = find(list, "policy_issued");
    expect(p.source).toBe("custom");
    expect(p.channelSms).toBe(false);
    expect(p.body).toContain("نص مخصّص");
  });

  it("افتراضي المنصة يُورَّث للحسابات بلا تخصيص", async () => {
    await request(srv()).put("/platform/notifications/welcome").set(auth(platform)).send({ channelEmail: true, channelSms: true, body: "ترحيب المنصة الموحّد" }).expect(200);
    const t = await owner(); // حساب جديد بلا تخصيص welcome
    const list = (await request(srv()).get("/notifications").set(auth(t)).expect(200)).body;
    const w = find(list, "welcome");
    expect(w.source).toBe("inherited");
    expect(w.body).toBe("ترحيب المنصة الموحّد");
  });

  it("عزل: تخصيص شركة لا يظهر لأخرى", async () => {
    const a = await owner();
    await request(srv()).put("/notifications/claim_ack").set(auth(a)).send({ channelEmail: false, channelSms: false, body: "سرّي" }).expect(200);
    const b = await owner();
    const list = (await request(srv()).get("/notifications").set(auth(b)).expect(200)).body;
    expect(find(list, "claim_ack").body).not.toBe("سرّي");
  });

  it("نوع مجهول ⇒ 400", async () => {
    const t = await owner();
    await request(srv()).put("/notifications/nope").set(auth(t)).send({ channelEmail: true, channelSms: false, body: "x" }).expect(400);
  });

  it("بلا مصادقة ⇒ 401", () => request(srv()).get("/notifications").expect(401));
});
