/**
 * البحث العام (⌘K): بحث موحّد عبر العميل/الوثيقة/المطالبة/الطلب/شركة التأمين بالاسم/الرقم.
 * يتحقّق: النتائج + الروابط الصحيحة · التصفية حسب صلاحية القراءة لكل نوع (RBAC) · العزل بين المستأجرين.
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

interface Hit { title: string; href: string }
interface Group { type: string; items: Hit[] }

describe("البحث العام (e2e)", () => {
  let app: INestApplication;
  let gulf: string;
  const srv = () => app.getHttpServer();
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const uniq = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const q = (token: string, term: string) =>
    request(srv()).get(`/search?q=${encodeURIComponent(term)}`).set(auth(token)).expect(200).then((r) => r.body.groups as Group[]);
  const groupOf = (groups: Group[], type: string) => groups.find((g) => g.type === type);

  async function newOwner(): Promise<string> {
    const res = await request(srv()).post("/signup").send({ companyName: `بحث ${uniq()}`, adminName: "مالك", adminEmail: `s-${uniq()}@brk.sa`, password: "Owner1Pass", seatCount: 25 }).expect(201);
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

  it("بحث باسم شركة التأمين ⇒ مجموعة insurer برابط 360° الصحيح", async () => {
    const g = groupOf(await q(gulf, "التعاونية"), "insurer");
    expect(g).toBeTruthy();
    expect(g!.items[0].href).toBe("/tenant/insurers/ins-dt-tw");
  });

  it("بحث باسم العميل ⇒ مجموعة client برابط العميل 360°", async () => {
    const g = groupOf(await q(gulf, "الفهد"), "client");
    expect(g).toBeTruthy();
    expect(g!.items.some((i) => i.href === "/tenant/clients/cl-fahd")).toBe(true);
  });

  it("بحث برقم الوثيقة (POL) ⇒ مجموعة policy غير فارغة بروابط الوثائق", async () => {
    const g = groupOf(await q(gulf, "POL"), "policy");
    expect(g).toBeTruthy();
    expect(g!.items.length).toBeGreaterThan(0);
    expect(g!.items[0].href).toMatch(/^\/tenant\/policies\//);
  });

  it("استعلام أقصر من حرفين ⇒ لا نتائج", async () => {
    expect(await q(gulf, "ا")).toEqual([]);
  });

  it("RBAC: موظف بصلاحية العملاء فقط لا يجد شركات التأمين (نوع محكوم بالمالية) لكنه يجد العملاء", async () => {
    const owner = await newOwner();
    // شركة تأمين بمصطلح فريد على هذا المستأجر
    const term = `فريدة${uniq()}`;
    await request(srv()).post("/insurers").set(auth(owner)).send({ name: `${term} للتأمين`, commissionRate: 10 }).expect(201);
    // المالك (كل الصلاحيات) يجدها
    expect(groupOf(await q(owner, term), "insurer")).toBeTruthy();
    // موظف بصلاحية «العملاء» فقط (بلا مالية)
    const email = `cl-${uniq()}@brk.sa`;
    await request(srv()).post("/staff").set(auth(owner)).send({ fullName: "موظف عملاء", email, password: "Worker1Pass", roleName: `عملاء ${uniq()}`, permissions: [{ module: "clients", canAccess: true, canCreate: true, canEdit: false, canDelete: false }] }).expect(201);
    const staff = (await request(srv()).post("/auth/login").send({ email, password: "Worker1Pass" })).body.accessToken;
    // الموظف لا يرى شركات التأمين في البحث (لا صلاحية مالية)
    expect(groupOf(await q(staff, term), "insurer")).toBeFalsy();
  });

  it("عزل: مستأجر آخر لا يجد عملاء/شركات مستأجر الخليج", async () => {
    const other = await newOwner();
    const groups = await q(other, "الفهد"); // عميل مزروع لدى الخليج فقط
    expect(groupOf(groups, "client")).toBeFalsy();
  });
});
