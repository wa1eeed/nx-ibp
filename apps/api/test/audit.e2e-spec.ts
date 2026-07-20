/**
 * اختبار عرض سجل التدقيق (للمستأجر والسوبر أدمن): تحويل المعرّف ⇒ اسم المنفّذ،
 * صلاحية الالتزام، العزل بين المستأجرين، وعرض المنصّة عابر الحسابات.
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

describe("سجل التدقيق (e2e)", () => {
  let app: INestApplication;
  const srv = () => app.getHttpServer();
  const uniq = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function newOwner(): Promise<{ token: string; fullName: string; tenantId: string }> {
    const name = `مالك ${uniq()}`;
    const res = await request(srv()).post("/signup").send({ companyName: `تدقيق ${uniq()}`, adminName: name, adminEmail: `au-${uniq()}@brk.sa`, password: "Owner1Pass", seatCount: 25 }).expect(201);
    const me = await request(srv()).get("/auth/me").set(auth(res.body.accessToken)).expect(200);
    return { token: res.body.accessToken, fullName: me.body.fullName, tenantId: res.body.tenant.id };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  afterAll(async () => { await app?.close(); });

  it("يحوّل معرّف المنفّذ إلى اسمه، ويعرض العملية بحقولها (IP/فعل/عنصر)", async () => {
    const o = await newOwner();
    const client = await request(srv()).post("/clients").set(auth(o.token)).send({ type: "CORPORATE", name: `عميل تدقيق ${uniq()}` }).expect(201);
    const rows = (await request(srv()).get("/audit").set(auth(o.token)).expect(200)).body as Array<{ actor: string; action: string; entity: string; entityId: string | null }>;
    const entry = rows.find((r) => r.entity === "client" && r.action === "create" && r.entityId === client.body.id);
    expect(entry).toBeTruthy();
    expect(entry!.actor).toBe(o.fullName); // ← الاسم لا المعرّف
  });

  it("فلترة بالفعل تعمل", async () => {
    const o = await newOwner();
    await request(srv()).post("/clients").set(auth(o.token)).send({ type: "CORPORATE", name: `عميل ${uniq()}` }).expect(201);
    const rows = (await request(srv()).get("/audit?action=create").set(auth(o.token)).expect(200)).body as Array<{ action: string }>;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.action === "create")).toBe(true);
  });

  it("موظف بلا صلاحية الالتزام ⇒ 403", async () => {
    const o = await newOwner();
    const email = `noc-${uniq()}@brk.sa`;
    await request(srv()).post("/staff").set(auth(o.token)).send({ fullName: "موظف", email, password: "Worker1Pass", roleName: `بلا التزام ${uniq()}`, permissions: [{ module: "clients", canAccess: true, canCreate: false, canEdit: false, canDelete: false }] }).expect(201);
    const staff = (await request(srv()).post("/auth/login").send({ email, password: "Worker1Pass" })).body.accessToken;
    await request(srv()).get("/audit").set(auth(staff)).expect(403);
  });

  it("عزل: مستأجر لا يرى تدقيق غيره", async () => {
    const a = await newOwner();
    const client = await request(srv()).post("/clients").set(auth(a.token)).send({ type: "CORPORATE", name: `سرّي ${uniq()}` }).expect(201);
    const b = await newOwner();
    const rows = (await request(srv()).get("/audit").set(auth(b.token)).expect(200)).body as Array<{ entityId: string | null }>;
    expect(rows.some((r) => r.entityId === client.body.id)).toBe(false);
  });

  it("السوبر أدمن يرى التدقيق عابرًا للحسابات بأسماء المنفّذين", async () => {
    const o = await newOwner();
    await request(srv()).post("/clients").set(auth(o.token)).send({ type: "CORPORATE", name: `عميل منصّة ${uniq()}` }).expect(201);
    const platform = (await request(srv()).post("/platform/login").send({ email: "admin@ibp-platform.sa", password: "Passw0rd!" })).body.accessToken;
    const rows = (await request(srv()).get(`/platform/audit?tenantId=${o.tenantId}`).set(auth(platform)).expect(200)).body as Array<{ actor: string; tenantId: string }>;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.tenantId === o.tenantId)).toBe(true);
    expect(rows.some((r) => r.actor === o.fullName)).toBe(true);
    // مستخدم مستأجر ممنوع من مسار المنصّة
    await request(srv()).get("/platform/audit").set(auth(o.token)).expect(403);
  });
});
