/**
 * اختبار الاحتفاظ/الإتلاف الآمن + DLP — تحقّق:
 *  - DLP: الهوية/الآيبان تُخفى لمن لا يملك الالتزام/المالية، وتظهر كاملةً لمن يملكها.
 *  - حق المحو (PDPL): محو بيانات العميل يُخفي كل PII ويُبقي الهيكل + سجلّ إتلاف؛ لا يتكرّر (409).
 *  - عزل صلاحية: بلا حذف العملاء لا يمحو (403).
 *  - الاحتفاظ: قراءة/ضبط المدّة (تحقّق الحدود) + تقرير الاستحقاق.
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { CryptoVaultService } from "../src/common/crypto/crypto-vault.service";

describe("الاحتفاظ/الإتلاف + DLP (e2e)", () => {
  let app: INestApplication;
  let gm: string; // مدير عام (له كل الصلاحيات + settings)
  let viewerTok = "", repTok = "";

  const srv = () => app.getHttpServer();
  const login = async (email: string, password = "Passw0rd!") =>
    (await request(srv()).post("/auth/login").send({ email, password })).body.accessToken as string;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const perm = (module: string, a: boolean, c = false, e = false, d = false) => ({ module, canAccess: a, canCreate: c, canEdit: e, canDelete: d, canRevert: false });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    gm = await login("waleed@gulf-demo.sa");
    const uniq = String(Date.now()).slice(-8);
    // viewer: يرى PII كاملًا (compliance) + يمحو (clients delete)
    await request(srv()).post("/staff").set(auth(gm)).send({ fullName: "مطّلع الالتزام", email: `dlp-view-${uniq}@gulf-demo.sa`, password: "Passw0rd1", roleName: `التزام-${uniq}`, permissions: [perm("clients", true, true, true, true), perm("compliance", true)] }).expect(201);
    // rep: يرى العملاء فقط (بلا التزام/مالية ⇒ PII مُخفى، وبلا حذف ⇒ لا يمحو)
    await request(srv()).post("/staff").set(auth(gm)).send({ fullName: "مندوب", email: `dlp-rep-${uniq}@gulf-demo.sa`, password: "Passw0rd1", roleName: `مندوب-${uniq}`, permissions: [perm("clients", true)] }).expect(201);
    viewerTok = await login(`dlp-view-${uniq}@gulf-demo.sa`, "Passw0rd1");
    repTok = await login(`dlp-rep-${uniq}@gulf-demo.sa`, "Passw0rd1");
  });

  afterAll(async () => {
    await request(srv()).put("/config/retention").set(auth(gm)).send({ retentionYears: 10 }); // إعادة للافتراضي
    await app?.close();
  });

  const nid = "10" + String(Date.now()).slice(-8);
  const iban = "SA0380000000608010167519";
  let clientId = "";

  it("DLP: الهوية/الآيبان تُخفى للمندوب وتظهر كاملةً للمطّلع", async () => {
    clientId = (await request(srv()).post("/clients").set(auth(gm)).send({ type: "INDIVIDUAL", name: "فرد DLP", nationalId: nid, iban }).expect(201)).body.id;

    const masked = (await request(srv()).get(`/clients/${clientId}`).set(auth(repTok)).expect(200)).body;
    expect(masked.nationalId).toContain("•");
    expect(masked.nationalId).not.toBe(nid);
    expect(masked.nationalId.endsWith(nid.slice(-4))).toBe(true); // آخر 4 للمطابقة
    expect(masked.iban).toContain("•");

    const full = (await request(srv()).get(`/clients/${clientId}`).set(auth(viewerTok)).expect(200)).body;
    expect(full.nationalId).toBe(nid);
    expect(full.iban).toBe(iban);
  });

  it("تشفير at-rest: الآيبان مخزَّن مشفّرًا (AES-256-GCM) لا نصًّا صريحًا، وقابلًا للفكّ", async () => {
    // قراءة القيمة الخام من القاعدة مباشرةً (SQL خام يتجاوز الإخفاء والوسيط)
    const prisma = app.get(PrismaService);
    const rows = await prisma.$queryRawUnsafe<Array<{ iban: string | null }>>(`SELECT iban FROM "Client" WHERE id = $1`, clientId);
    const stored = rows[0]?.iban ?? "";
    expect(stored).not.toBe(iban); // ليست القيمة الصريحة
    expect(stored.length).toBeGreaterThan(iban.length); // ciphertext (iv+tag+ct، base64) أطول
    // قابلة للفكّ عبر الخزنة ⇒ تطابق الأصل (سلامة + سرّية)
    expect(app.get(CryptoVaultService).decrypt(stored)).toBe(iban);
  });

  it("PDPL: المحو يُخفي كل PII ويُبقي الهيكل + يُسجَّل، ولا يتكرّر (409)", async () => {
    const erased = (await request(srv()).post(`/clients/${clientId}/erase`).set(auth(viewerTok)).send({ reason: "طلب صاحب البيانات" }).expect(200)).body;
    expect(erased.status).toBe("erased");
    expect(erased.erasedAt).toBeTruthy();

    const after = (await request(srv()).get(`/clients/${clientId}`).set(auth(viewerTok)).expect(200)).body;
    expect(after.name).toContain("محذوف");
    expect(after.nationalId).toBeNull();
    expect(after.iban).toBeNull();

    await request(srv()).post(`/clients/${clientId}/erase`).set(auth(viewerTok)).send({}).expect(409); // لا يتكرّر
  });

  it("سجلّ الإتلاف يضمّ العميل الممحوّ (كود + توقيت، بلا PII)", async () => {
    const reg = (await request(srv()).get("/clients/erasures").set(auth(gm)).expect(200)).body as Array<{ id: string; erasedAt: string; code: string }>;
    const row = reg.find((r) => r.id === clientId);
    expect(row).toBeTruthy();
    expect(row?.erasedAt).toBeTruthy();
    expect(JSON.stringify(row)).not.toContain(nid); // بلا هوية
  });

  it("عزل: المندوب (بلا حذف العملاء) لا يمحو ⇒ 403", async () => {
    const other = (await request(srv()).post("/clients").set(auth(gm)).send({ type: "CORPORATE", name: "منشأة", crNumber: String(Date.now()).slice(-10) }).expect(201)).body.id;
    await request(srv()).post(`/clients/${other}/erase`).set(auth(repTok)).send({}).expect(403);
  });

  it("الاحتفاظ: الافتراضي 10، والضبط ضمن الحدود (0 مرفوض)", async () => {
    expect((await request(srv()).get("/config/retention").set(auth(gm)).expect(200)).body.retentionYears).toBe(10);
    await request(srv()).put("/config/retention").set(auth(gm)).send({ retentionYears: 0 }).expect(400); // خارج الحدود
    expect((await request(srv()).put("/config/retention").set(auth(gm)).send({ retentionYears: 7 }).expect(200)).body.retentionYears).toBe(7);
    expect((await request(srv()).get("/config/retention").set(auth(gm)).expect(200)).body.retentionYears).toBe(7);
  });

  it("تقرير الاستحقاق للإتلاف يعكس مدّة الاحتفاظ المهيّأة", async () => {
    const due = (await request(srv()).get("/clients/retention/due").set(auth(gm)).expect(200)).body;
    expect(due.retentionYears).toBe(7);
    expect(typeof due.count).toBe("number");
    expect(Array.isArray(due.due)).toBe(true);
  });
});
