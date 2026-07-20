/**
 * §8.2 — طلبات إجازات الموظفين:
 *  - الموظف يقدّم طلبًا (أيام تشمل الطرفين) ويرى طلباته؛ الإدارة (settings) ترى الكل وتبتّ.
 *  - **لا يبتّ الموظف طلبه** (فصل مهام 403)؛ البتّ يحوّل الحالة (معلّق ⇒ موافَق/مرفوض)؛ إعادة البتّ 409.
 *  - تحقّق (نوع/تواريخ) + صلاحية العرض الكامل (settings) + عزل.
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

describe("§8.2 طلبات الإجازات (e2e)", () => {
  let app: INestApplication;
  const srv = () => app.getHttpServer();
  const uniq = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const owner = async () => (await request(srv()).post("/signup").send({ companyName: `إجازات ${uniq()}`, adminName: "مالك", adminEmail: `lv-${uniq()}@brk.sa`, password: "Owner1Pass", seatCount: 25 }).expect(201)).body.accessToken;
  // موظف بصلاحية الإعدادات (لبتّ الطلبات) أو بلا صلاحيتها (لاختبار 403)
  const addStaff = async (t: string, withSettings: boolean) => {
    const email = `st-${uniq()}@brk.sa`;
    const perms = withSettings ? [{ module: "settings", canAccess: true, canCreate: false, canEdit: true, canDelete: false }] : [{ module: "sales", canAccess: true, canCreate: false, canEdit: false, canDelete: false }];
    await request(srv()).post("/staff").set(auth(t)).send({ fullName: "موظف", email, password: "Passw0rd1", roleName: `دور-${uniq()}`, permissions: perms }).expect(201);
    return (await request(srv()).post("/auth/login").send({ email, password: "Passw0rd1" })).body.accessToken as string;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  afterAll(async () => { await app?.close(); });

  it("تقديم طلب ⇒ أيام تشمل الطرفين + يظهر في طلباتي والقائمة", async () => {
    const t = await owner();
    const r = (await request(srv()).post("/leave").set(auth(t)).send({ type: "annual", startDate: "2026-08-01", endDate: "2026-08-05", reason: "سفر" }).expect(201)).body;
    expect(r.status).toBe("pending");
    expect(r.days).toBe(5); // 1..5 شاملة
    expect((await request(srv()).get("/leave/mine").set(auth(t)).expect(200)).body.length).toBe(1);
    expect((await request(srv()).get("/leave").set(auth(t)).expect(200)).body.some((x: any) => x.id === r.id)).toBe(true);
  });

  it("فصل المهام: الموظف لا يبتّ طلبه (403)؛ ومديرٌ آخر يوافق", async () => {
    const t = await owner();
    const emp = await addStaff(t, false); // موظف بلا صلاحية إعدادات
    const r = (await request(srv()).post("/leave").set(auth(emp)).send({ type: "sick", startDate: "2026-09-10", endDate: "2026-09-11" }).expect(201)).body;
    // الموظف لا يرى القائمة الكاملة ولا يبتّ (بلا settings)
    await request(srv()).get("/leave").set(auth(emp)).expect(403);
    await request(srv()).post(`/leave/${r.id}/decide`).set(auth(emp)).send({ status: "approved" }).expect(403);
    // المالك (settings) يوافق ⇒ ثم إعادة البتّ 409
    const d = (await request(srv()).post(`/leave/${r.id}/decide`).set(auth(t)).send({ status: "approved", note: "مقبول" }).expect(201)).body;
    expect(d.status).toBe("approved");
    await request(srv()).post(`/leave/${r.id}/decide`).set(auth(t)).send({ status: "rejected" }).expect(409);
  });

  it("المالك لا يبتّ طلب إجازته (فصل مهام 403)", async () => {
    const t = await owner();
    const r = (await request(srv()).post("/leave").set(auth(t)).send({ type: "unpaid", startDate: "2026-10-01", endDate: "2026-10-02" }).expect(201)).body;
    await request(srv()).post(`/leave/${r.id}/decide`).set(auth(t)).send({ status: "approved" }).expect(403);
  });

  it("تحقّق: نوع مجهول أو تاريخ نهاية قبل البداية ⇒ 400", async () => {
    const t = await owner();
    await request(srv()).post("/leave").set(auth(t)).send({ type: "vacation", startDate: "2026-08-01", endDate: "2026-08-05" }).expect(400);
    await request(srv()).post("/leave").set(auth(t)).send({ type: "annual", startDate: "2026-08-05", endDate: "2026-08-01" }).expect(400);
  });

  it("عزل: طلبات شركة لا تظهر لأخرى", async () => {
    const a = await owner();
    await request(srv()).post("/leave").set(auth(a)).send({ type: "annual", startDate: "2026-08-01", endDate: "2026-08-03" }).expect(201);
    const b = await owner();
    expect((await request(srv()).get("/leave").set(auth(b)).expect(200)).body.length).toBe(0);
  });
});
