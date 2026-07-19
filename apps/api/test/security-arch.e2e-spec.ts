/**
 * تحقّق من متطلّبات المعمار والأمن (Backend Architecture · Audit Trail · AppSec):
 *  - مستقبِل أحداث المؤمِّنين الموحّد (Carrier Webhook): توقيع صحيح ⇒ 200 · خاطئ/غائب ⇒ 401.
 *  - إثراء سجل التدقيق: الدور + معرّف الجلسة + لقطتا الحالة (old/new) تُلتقط فعليًا عند تغيير الحالة.
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { createHmac } from "node:crypto";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { canonicalJson } from "../src/modules/webhooks/webhooks.service";

describe("المعمار والأمن — Webhook + سجل التدقيق (e2e)", () => {
  let app: INestApplication;
  let gm: string;
  const srv = () => app.getHttpServer();
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const uniq = () => String(Date.now()).slice(-9) + Math.floor(Math.random() * 1000);
  const SECRET = "carrier_test_secret_123";

  beforeAll(async () => {
    process.env.CARRIER_WEBHOOK_SECRET = SECRET; // سرّ المؤمِّن العام (تُقرأ وقت التحقّق)
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    gm = (await request(srv()).post("/auth/login").send({ email: "waleed@gulf-demo.sa", password: "Passw0rd!" })).body.accessToken;
  });
  afterAll(async () => { await app?.close(); });

  // ————— Spec 1: مستقبِل أحداث المؤمِّنين الموحّد بمصادقة توقيع —————
  it("Carrier webhook: توقيع HMAC صحيح ⇒ 200؛ خاطئ ⇒ 401؛ غائب ⇒ 401", async () => {
    const payload = { eventId: `evt-${uniq()}`, eventType: "policy.updated", policyRef: "POL-1", status: "active" };
    const sig = createHmac("sha256", SECRET).update(canonicalJson(payload)).digest("hex");

    const ok = await request(srv()).post("/webhooks/carrier/tawuniya").set("x-carrier-signature", `sha256=${sig}`).send(payload).expect(200);
    expect(ok.body.ok).toBe(true);
    expect(ok.body.received).toBe(payload.eventId);

    await request(srv()).post("/webhooks/carrier/tawuniya").set("x-carrier-signature", "sha256=deadbeef").send(payload).expect(401);
    await request(srv()).post("/webhooks/carrier/tawuniya").send(payload).expect(401);
  });

  // ————— Spec 2: إثراء سجل التدقيق (الدور + الجلسة + old/new) —————
  it("سجل التدقيق يلتقط الدور ومعرّف الجلسة ولقطتَي الحالة عند قرار الالتزام", async () => {
    const crNumber = ("40" + uniq()).slice(0, 10);
    const clientId = (await request(srv()).post("/clients").set(auth(gm)).send({ type: "CORPORATE", name: "منشأة تدقيق", city: "الرياض", crNumber }).expect(201)).body.id;
    await request(srv()).post(`/clients/${clientId}/compliance`).set(auth(gm)).send({ decision: "APPROVED", note: "مطابق" }).expect(200);

    const prisma = app.get(PrismaService);
    const rows = await prisma.$queryRawUnsafe<Array<{ role: string | null; sessionId: string | null; oldValues: unknown; newValues: unknown }>>(
      `SELECT role, "sessionId", "oldValues", "newValues" FROM "AuditLog" WHERE entity='client' AND action='approve' AND "entityId"=$1 ORDER BY "createdAt" DESC LIMIT 1`,
      clientId,
    );
    const log = rows[0];
    expect(log).toBeTruthy();
    expect(log.role).toBeTruthy(); // الدور (roleId) وقت العملية
    expect(log.sessionId).toBeTruthy(); // معرّف الجلسة (sid من JWT)
    expect((log.newValues as { complianceStatus?: string })?.complianceStatus).toBe("APPROVED");
    expect((log.oldValues as { complianceStatus?: string })?.complianceStatus).toBe("PENDING"); // الحالة قبل القرار
  });
});
