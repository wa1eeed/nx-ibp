/**
 * سجلّ رحلة الكيان (Lifecycle Timeline): يجمع مسار الوثيقة/الطلب عبر أطواره —
 * فرصة CRM ⇐ الطلب ⇐ التسعير ⇐ الإصدار ⇐ المالية — كل حدث بوقته واسم منفِّذه.
 * يتحقّق: تجميع عابر للكيانات · الترتيب الزمني · أسماء المنفِّذين · العزل · الصلاحية.
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

interface Ev { at: string; actor: string; phase: string; action: string; label: string }

describe("سجلّ رحلة الكيان (e2e)", () => {
  let app: INestApplication;
  let gulf: string;
  const srv = () => app.getHttpServer();
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const uniq = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  async function newOwner(): Promise<string> {
    const res = await request(srv()).post("/signup").send({ companyName: `رحلة ${uniq()}`, adminName: "مالك", adminEmail: `lf-${uniq()}@brk.sa`, password: "Owner1Pass", seatCount: 25 }).expect(201);
    return res.body.accessToken;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    gulf = (await request(srv()).post("/auth/login").send({ email: "waleed@gulf-demo.sa", password: "Passw0rd!" })).body.accessToken;
  });
  afterAll(async () => { await app?.close(); });

  it("رحلة الطلب: تجمع طور CRM + الطلب، بأسماء المنفِّذين ومرتّبة زمنيًا تصاعديًا", async () => {
    await request(srv()).post("/clients/cl-naseej/compliance").set(auth(gulf)).send({ decision: "APPROVED" });
    const deal = (await request(srv()).post("/crm/deals").set(auth(gulf)).send({ title: `رحلة ${uniq()}`, clientId: "cl-naseej", productLineCode: "MCI" }).expect(201)).body;
    const conv = (await request(srv()).post(`/crm/deals/${deal.id}/convert`).set(auth(gulf)).expect(201)).body;
    const requestId = conv.request.id;

    const { events } = (await request(srv()).get(`/requests/${requestId}/timeline`).set(auth(gulf)).expect(200)).body as { events: Ev[] };
    expect(events.length).toBeGreaterThanOrEqual(2);
    // كل حدث له منفِّذ ووقت
    expect(events.every((e) => typeof e.actor === "string" && e.actor.length > 0 && !!e.at)).toBe(true);
    // مرتّب تصاعديًا (من أول إجراء)
    const times = events.map((e) => new Date(e.at).getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
    // يشمل طور العلاقات (الفرصة) وطور الطلب
    expect(events.some((e) => e.phase === "crm")).toBe(true);
    expect(events.some((e) => e.phase === "request")).toBe(true);
    // منفِّذ الفرصة = المالك (وليد الحربي)
    expect(events.some((e) => e.actor.includes("وليد"))).toBe(true);
  });

  it("رحلة الوثيقة: المسار يعمل + عزل (404) + غير موجود (404)", async () => {
    const policies = (await request(srv()).get("/policies").set(auth(gulf)).expect(200)).body as Array<{ id: string }>;
    expect(policies.length).toBeGreaterThan(0);
    const pid = policies[0].id;
    const res = (await request(srv()).get(`/policies/${pid}/timeline`).set(auth(gulf)).expect(200)).body as { events: Ev[] };
    expect(Array.isArray(res.events)).toBe(true);
    // عزل: مستأجر آخر لا يصل رحلة وثيقة الخليج ⇒ 404
    const other = await newOwner();
    await request(srv()).get(`/policies/${pid}/timeline`).set(auth(other)).expect(404);
    // غير موجود ⇒ 404
    await request(srv()).get(`/policies/none-${uniq()}/timeline`).set(auth(gulf)).expect(404);
  });

  it("بلا صلاحية الإنتاج ⇒ 403 على رحلة الوثيقة", async () => {
    const owner = await newOwner();
    const email = `nt-${uniq()}@brk.sa`;
    await request(srv()).post("/staff").set(auth(owner)).send({ fullName: "موظف", email, password: "Worker1Pass", roleName: `بلا إنتاج ${uniq()}`, permissions: [{ module: "clients", canAccess: true, canCreate: false, canEdit: false, canDelete: false }] }).expect(201);
    const staff = (await request(srv()).post("/auth/login").send({ email, password: "Worker1Pass" })).body.accessToken;
    await request(srv()).get("/policies/any/timeline").set(auth(staff)).expect(403);
  });
});
