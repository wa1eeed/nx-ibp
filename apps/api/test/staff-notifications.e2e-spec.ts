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
import { TenantEmailService } from "../src/modules/email/tenant-email.service";

class CapturingGateway {
  name = "capture";
  sent: { channel: string; to: string; subject?: string; body: string }[] = [];
  async send(msg: { channel: string; to: string; subject?: string; body: string }) {
    this.sent.push(msg);
    return { ok: true, id: "cap" };
  }
}

/** يلتقط رسائل البريد التي تمرّ عبر دالة الإرسال الموحّدة sendTenantEmail (البريد لم يعد يمرّ بالبوّابة). */
class CapturingEmail {
  tos: string[] = [];
  async sendTenantEmail(_tenantId: string, to: string) {
    this.tos.push(to);
    return { ok: true, via: "tenant" as const };
  }
  clear() { this.tos = []; }
  emails() { return this.tos; }
}

describe("توجيه إشعارات الموظفين — الوحدة + المالك (e2e)", () => {
  let app: INestApplication;
  const gateway = new CapturingGateway();
  const email = new CapturingEmail();
  let gm: string; // مالك حساب gulf (أوّل مستخدم)
  let withClaimsEmail = ""; // موظف له صلاحية المطالبات (يُنشأ في الاختبار الأول)

  const login = async (emailAddr: string, password = "Passw0rd!") =>
    (await request(app.getHttpServer()).post("/auth/login").send({ email: emailAddr, password })).body.accessToken as string;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const perm = (module: string, canAccess: boolean) => ({ module, canAccess, canCreate: false, canEdit: false, canDelete: false });
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  async function waitForEmails(min: number, ms = 2500) {
    const start = Date.now();
    while (Date.now() - start < ms) {
      if (email.emails().length >= min) return;
      await sleep(40);
    }
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NOTIFICATION_GATEWAY)
      .useValue(gateway)
      .overrideProvider(TenantEmailService)
      .useValue(email)
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
    withClaimsEmail = withClaims;
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
    email.clear();

    await request(app.getHttpServer()).post("/claims").set(auth(gm)).send({ insurerName: "شركة تأمين", claimedAmount: 1000 }).expect(201);
    await waitForEmails(1);

    const emails = email.emails();
    expect(emails).toContain("waleed@gulf-demo.sa"); // مالك الحساب دائمًا
    expect(emails).toContain(withClaims);            // صاحب صلاحية المطالبات
    expect(emails).not.toContain(noClaims);          // بلا صلاحية ⇒ لا يصله
  });

  it("الإشعار يُحفظ داخل المنصة ويظهر في صندوق الموظف ثم يُعلَّم مقروءًا", async () => {
    const staff = await login(withClaimsEmail, "Passw0rd1");
    const before = (await request(app.getHttpServer()).get("/notifications/inbox/unread-count").set(auth(staff)).expect(200)).body;
    expect(before.count).toBeGreaterThanOrEqual(1);

    const inbox = (await request(app.getHttpServer()).get("/notifications/inbox").set(auth(staff)).expect(200)).body as Array<{ id: string; eventKey: string; readAt: string | null }>;
    const claimNotif = inbox.find((n) => n.eventKey === "staff_claim_created");
    expect(claimNotif).toBeTruthy();
    expect(claimNotif!.readAt).toBeNull();

    await request(app.getHttpServer()).post(`/notifications/inbox/${claimNotif!.id}/read`).set(auth(staff)).expect(201);
    const after = (await request(app.getHttpServer()).get("/notifications/inbox/unread-count").set(auth(staff)).expect(200)).body;
    expect(after.count).toBe(before.count - 1);
  });

  it("عزل: موظف لا يرى إشعارات موظف آخر", async () => {
    // موظف جديد بلا أي أحداث سابقة ⇒ صندوقه لا يحوي إشعار المطالبة أعلاه
    const uniq = String(Date.now()).slice(-7);
    const fresh = `fresh-${uniq}@gulf-demo.sa`;
    await request(app.getHttpServer()).post("/staff").set(auth(gm)).send({
      fullName: "موظف جديد", email: fresh, password: "Passw0rd1", roleName: `جديد-${uniq}`,
      permissions: [perm("dashboard", true)],
    }).expect(201);
    const freshTok = await login(fresh, "Passw0rd1");
    const inbox = (await request(app.getHttpServer()).get("/notifications/inbox").set(auth(freshTok)).expect(200)).body as Array<{ eventKey: string }>;
    expect(inbox.every((n) => n.eventKey !== "staff_claim_created")).toBe(true);
  });
});
