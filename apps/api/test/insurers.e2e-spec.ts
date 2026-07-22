/**
 * اختبار إدارة شركات التأمين (المؤمِّنون): CRUD + إحصاءات الإنتاج + تحقّق + عزل + صلاحية المالية.
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

describe("شركات التأمين (e2e)", () => {
  let app: INestApplication;
  const srv = () => app.getHttpServer();
  const uniq = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function newOwner(): Promise<string> {
    const res = await request(srv()).post("/signup").send({ companyName: `مؤمِّن ${uniq()}`, adminName: "مالك", adminEmail: `in-${uniq()}@brk.sa`, password: "Owner1Pass", seatCount: 25 }).expect(201);
    return res.body.accessToken;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  afterAll(async () => { await app?.close(); });

  it("إنشاء شركة تأمين ⇒ تظهر بإحصاءات إنتاج + نِسبة/تسوية/بنك", async () => {
    const token = await newOwner();
    const created = await request(srv()).post("/insurers").set(auth(token)).send({
      name: "شركة التعاونية", nameEn: "Tawuniya", commissionRate: 15, settlementDays: 60, bankName: "الراجحي", iban: "SA1234567890", contactEmail: "brokers@tawuniya.sa",
    }).expect(201);
    expect(created.body.id).toBeTruthy();
    const list = (await request(srv()).get("/insurers").set(auth(token)).expect(200)).body as Array<{ id: string; commissionRate: number; settlementDays: number; stats: { count: number; grossPremium: number; commission: number } }>;
    const row = list.find((r) => r.id === created.body.id)!;
    expect(row.commissionRate).toBe(15);
    expect(row.settlementDays).toBe(60);
    expect(row.stats).toEqual({ count: 0, grossPremium: 0, commission: 0 }); // مستأجر جديد بلا وثائق
  });

  it("نسبة عمولة > 100 ⇒ 400", async () => {
    const token = await newOwner();
    await request(srv()).post("/insurers").set(auth(token)).send({ name: "شركة", commissionRate: 150 }).expect(400);
  });

  it("تعديل وحذف", async () => {
    const token = await newOwner();
    const c = await request(srv()).post("/insurers").set(auth(token)).send({ name: "للتعديل", commissionRate: 10 }).expect(201);
    const up = await request(srv()).put(`/insurers/${c.body.id}`).set(auth(token)).send({ commissionRate: 20, status: "inactive" }).expect(200);
    expect(Number(up.body.commissionRate)).toBe(20);
    expect(up.body.status).toBe("inactive");
    await request(srv()).delete(`/insurers/${c.body.id}`).set(auth(token)).expect(200);
    const list = (await request(srv()).get("/insurers").set(auth(token)).expect(200)).body as Array<{ id: string }>;
    expect(list.some((r) => r.id === c.body.id)).toBe(false);
  });

  it("حماية سلامة البيانات: حذف شركة لها وثائق صادرة ⇒ 409 (تعطيل بدل حذف)؛ وشركة بلا ارتباط ⇒ 200", async () => {
    const gulf = (await request(srv()).post("/auth/login").send({ email: "waleed@gulf-demo.sa", password: "Passw0rd!" })).body.accessToken;
    const list = (await request(srv()).get("/insurers").set(auth(gulf)).expect(200)).body as Array<{ id: string; name: string; stats: { count: number } }>;
    const withPolicies = list.find((r) => r.stats.count > 0)!; // مثل «التعاونية» — لها وثائق مزروعة
    expect(withPolicies).toBeTruthy();
    await request(srv()).delete(`/insurers/${withPolicies.id}`).set(auth(gulf)).expect(409); // محميّة
    // شركة جديدة بلا وثائق ⇒ الحذف مسموح
    const fresh = (await request(srv()).post("/insurers").set(auth(gulf)).send({ name: `مؤقّتة ${uniq()}` }).expect(201)).body;
    await request(srv()).delete(`/insurers/${fresh.id}`).set(auth(gulf)).expect(200);
  });

  it("نظرة 360° لشركة: تجمع الوثائق/العمولة/المطالبات + أسماء العملاء + عزل + 404 لغير الموجود", async () => {
    const gulf = (await request(srv()).post("/auth/login").send({ email: "waleed@gulf-demo.sa", password: "Passw0rd!" })).body.accessToken;
    // «التعاونية» (ins-dt-tw) لها وثيقتان + مطالبة + عمولة مستحقّة (4500) مزروعة
    const ov = (await request(srv()).get("/insurers/ins-dt-tw/overview").set(auth(gulf)).expect(200)).body as {
      insurer: { name: string }; stats: { policyCount: number; commissionAccrued: number; commissionReceived: number; commissionOutstanding: number; claimCount: number };
      policies: Array<{ clientName: string | null }>; commissions: unknown[]; claims: unknown[];
    };
    expect(ov.insurer.name).toBe("التعاونية للتأمين");
    expect(ov.stats.policyCount).toBeGreaterThanOrEqual(2);
    expect(ov.stats.commissionAccrued).toBeGreaterThanOrEqual(4500);
    expect(ov.stats.commissionOutstanding).toBe(Math.max(0, ov.stats.commissionAccrued - ov.stats.commissionReceived));
    expect(ov.stats.claimCount).toBeGreaterThanOrEqual(1);
    expect(ov.policies.some((p) => !!p.clientName)).toBe(true); // اسم العميل محلول للربط
    // عزل: مستأجر آخر لا يصل نظرة مؤمِّن الخليج ⇒ 404
    const other = await newOwner();
    await request(srv()).get("/insurers/ins-dt-tw/overview").set(auth(other)).expect(404);
    // غير موجود ⇒ 404
    await request(srv()).get(`/insurers/none-${uniq()}/overview`).set(auth(gulf)).expect(404);
  });

  it("نظرة 360°: موظف بلا صلاحية المالية ⇒ 403", async () => {
    const token = await newOwner();
    const email = `nf360-${uniq()}@brk.sa`;
    await request(srv()).post("/staff").set(auth(token)).send({ fullName: "موظف", email, password: "Worker1Pass", roleName: `بلا مالية ${uniq()}`, permissions: [{ module: "clients", canAccess: true, canCreate: false, canEdit: false, canDelete: false }] }).expect(201);
    const staff = (await request(srv()).post("/auth/login").send({ email, password: "Worker1Pass" })).body.accessToken;
    await request(srv()).get("/insurers/any/overview").set(auth(staff)).expect(403);
  });

  it("عزل: مستأجر لا يرى مؤمِّني غيره", async () => {
    const a = await newOwner();
    const c = await request(srv()).post("/insurers").set(auth(a)).send({ name: `سرّي ${uniq()}` }).expect(201);
    const b = await newOwner();
    const list = (await request(srv()).get("/insurers").set(auth(b)).expect(200)).body as Array<{ id: string }>;
    expect(list.some((r) => r.id === c.body.id)).toBe(false);
    await request(srv()).put(`/insurers/${c.body.id}`).set(auth(b)).send({ commissionRate: 5 }).expect(404);
  });

  it("موظف بلا صلاحية المالية ⇒ 403", async () => {
    const token = await newOwner();
    const email = `nf-${uniq()}@brk.sa`;
    await request(srv()).post("/staff").set(auth(token)).send({ fullName: "موظف", email, password: "Worker1Pass", roleName: `بلا مالية ${uniq()}`, permissions: [{ module: "clients", canAccess: true, canCreate: false, canEdit: false, canDelete: false }] }).expect(201);
    const staff = (await request(srv()).post("/auth/login").send({ email, password: "Worker1Pass" })).body.accessToken;
    await request(srv()).get("/insurers").set(auth(staff)).expect(403);
    await request(srv()).post("/insurers").set(auth(staff)).send({ name: "x" }).expect(403);
  });

  it("خيارات المؤمِّنين: النشطة فقط بنسبها + متاحة للاكتتاب (لا تتطلّب المالية) — لتعبئة العمولة تلقائيًا في التسعير", async () => {
    const token = await newOwner();
    await request(srv()).post("/insurers").set(auth(token)).send({ name: "التعاونية", commissionRate: 15 }).expect(201);
    await request(srv()).post("/insurers").set(auth(token)).send({ name: "معطّلة", commissionRate: 9, status: "inactive" }).expect(201);

    const opts = (await request(srv()).get("/insurers/options").set(auth(token)).expect(200)).body as Array<{ name: string; commissionRate: number | null }>;
    expect(opts.find((o) => o.name === "التعاونية")?.commissionRate).toBe(15); // النسبة تتدفّق للتعبئة التلقائية
    expect(opts.find((o) => o.name === "معطّلة")).toBeFalsy(); // النشطة فقط

    // مكتتب (اكتتاب فقط، بلا مالية): يقرأ الخيارات لكن يُمنع من سجلّ المؤمِّنين الكامل
    const email = `uw-${uniq()}@brk.sa`;
    await request(srv()).post("/staff").set(auth(token)).send({ fullName: "مكتتب", email, password: "Under1Pass", roleName: `اكتتاب ${uniq()}`, permissions: [{ module: "underwriting", canAccess: true, canCreate: true, canEdit: false, canDelete: false }] }).expect(201);
    const uw = (await request(srv()).post("/auth/login").send({ email, password: "Under1Pass" })).body.accessToken;
    await request(srv()).get("/insurers/options").set(auth(uw)).expect(200);
    await request(srv()).get("/insurers").set(auth(uw)).expect(403);
  });
});
