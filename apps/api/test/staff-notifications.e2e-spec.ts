/**
 * اختبار توجيه إشعارات الموظفين (توسعة نظام الإشعارات لكامل النظام):
 *  - عند حدث موظفين (staff_claim_created / وحدة claims) يصل الإشعار **لمالك الحساب**
 *    (أوّل مستخدم) + **كل من له صلاحية وصول تلك الوحدة**، ولا يصل لمن لا صلاحية له.
 *  - نلتقط رسائل البوّابة عبر استبدال مزوّد الإرسال (overrideProvider).
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { NOTIFICATION_GATEWAY } from "../src/modules/notifications/notification.gateway";

class CapturingGateway {
  name = "capture";
  sent: { channel: string; to: string; subject?: string; body: string }[] = [];
  async send(msg: { channel: string; to: string; subject?: string; body: string }) {
    this.sent.push(msg);
    return { ok: true, id: "cap" };
  }
  clear() { this.sent = []; }
  emails() { return this.sent.filter((m) => m.channel === "email").map((m) => m.to); }
}

describe("توجيه إشعارات الموظفين — الوحدة + المالك (e2e)", () => {
  let app: INestApplication;
  const gateway = new CapturingGateway();
  let gm: string; // مالك حساب gulf (أوّل مستخدم)

  const login = async (email: string) =>
    (await request(app.getHttpServer()).post("/auth/login").send({ email, password: "Passw0rd!" })).body.accessToken as string;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const perm = (module: string, canAccess: boolean) => ({ module, canAccess, canCreate: false, canEdit: false, canDelete: false });
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  async function waitForEmails(min: number, ms = 2500) {
    const start = Date.now();
    while (Date.now() - start < ms) {
      if (gateway.emails().length >= min) return;
      await sleep(40);
    }
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NOTIFICATION_GATEWAY)
      .useValue(gateway)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    gm = await login("waleed@gulf-demo.sa");
  });

  afterAll(async () => { await app?.close(); });

  it("staff_claim_created ⇒ يصل للمالك + صاحب صلاحية المطالبات، لا لمن بلا صلاحية", async () => {
    const uniq = String(Date.now()).slice(-8);
    const withClaims = `claims-${uniq}@gulf-demo.sa`;
    const noClaims = `noclaims-${uniq}@gulf-demo.sa`;

    await request(app.getHttpServer()).post("/staff").set(auth(gm)).send({
      fullName: "موظف المطالبات", email: withClaims, password: "Passw0rd1", roleName: `مطالبات-${uniq}`,
      permissions: [perm("claims", true)],
    }).expect(201);
    await request(app.getHttpServer()).post("/staff").set(auth(gm)).send({
      fullName: "موظف اللوحة", email: noClaims, password: "Passw0rd1", roleName: `لوحة-${uniq}`,
      permissions: [perm("dashboard", true), perm("claims", false)],
    }).expect(201);

    await sleep(300); // ترك إشعارات staff_member_added تُصرّف قبل التصفير
    gateway.clear();

    await request(app.getHttpServer()).post("/claims").set(auth(gm)).send({ insurerName: "شركة تأمين", claimedAmount: 1000 }).expect(201);
    await waitForEmails(1);

    const emails = gateway.emails();
    expect(emails).toContain("waleed@gulf-demo.sa"); // مالك الحساب دائمًا
    expect(emails).toContain(withClaims);            // صاحب صلاحية المطالبات
    expect(emails).not.toContain(noClaims);          // بلا صلاحية ⇒ لا يصله
  });
});
