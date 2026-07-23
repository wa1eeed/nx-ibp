/**
 * اختبار **رخصة المقاعد (نموذج مسبق الدفع)** + تحكّم السوبر أدمن بالأسعار:
 *  - شركة جديدة تُقيَّد بالمقاعد المرخّصة (= المختارة عند التسجيل، رخصة التجربة).
 *  - `GET /staff/seats` يعيد `limit`/`available` الحقيقيين.
 *  - إضافة مستخدم ضمن الرخصة تنجح؛ وتجاوزها ⇒ **402** (`SEAT_LIMIT_REACHED`).
 *  - **شراء مقاعد** (POST /billing/seats/checkout ⇒ confirm) يرفع الرخصة فيُسمح بالإضافة.
 *  - السوبر أدمن يعدّل السعر ويظهر في الكتالوج العام؛ وعزل: مستخدم الشركة لا يعدّل الباقات.
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

describe("رخصة المقاعد — مسبق الدفع (e2e)", () => {
  let app: INestApplication;
  let admin: string; // سوبر أدمن المنصّة
  let omar: string; // مدير عام الأمان (باقة basic)

  const srv = () => app.getHttpServer();
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const perm = (m: string) => ({ module: m, canAccess: true, canCreate: false, canEdit: false, canDelete: false, canRevert: false });
  const uniq = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const newUser = (email: string) => ({ fullName: "مقعد اختبار", email, password: "Passw0rd1", roleName: `دور-${email}`, permissions: [perm("dashboard")] });
  const seatsOf = async (t: string) => (await request(srv()).get("/staff/seats").set(auth(t)).expect(200)).body as { used: number; limit: number; available: number; planName: string | null };

  // شركة جديدة برخصة seatCount مقاعد (المالك = مستخدم واحد نشط)
  const signup = async (seatCount: number) => {
    const res = await request(srv()).post("/signup").send({ companyName: "وساطة المقاعد", adminName: "المالك", adminEmail: `seatowner-${uniq()}@seat-broker.sa`, password: "Owner1Pass", planCode: "basic", seatCount }).expect(201);
    return res.body.accessToken as string;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    admin = (await request(srv()).post("/platform/login").send({ email: "admin@ibp-platform.sa", password: "Passw0rd!" })).body.accessToken;
    omar = (await request(srv()).post("/auth/login").send({ email: "omar@aman-demo.sa", password: "Passw0rd!" })).body.accessToken;
  });

  afterAll(async () => {
    await request(srv()).put("/platform/plans/basic").set(auth(admin)).send({ priceMonthly: 230, priceYearly: 2300, trialDays: 14 }); // استعادة الافتراضي
    await app?.close();
  });

  it("سوبر أدمن يعدّل سعر الباقة (شهري/سنوي) ومدة التجربة ⇒ يظهر في الكتالوج العام", async () => {
    const r = await request(srv()).put("/platform/plans/basic").set(auth(admin)).send({ priceMonthly: 88, priceYearly: 880, trialDays: 21 }).expect(200);
    expect(Number(r.body.priceMonthly)).toBe(88);
    expect(r.body.trialDays).toBe(21);
    const pub = (await request(srv()).get("/signup/plans").expect(200)).body as Array<{ code: string; pricePerUserMonthly: number; savingsPct: number }>;
    const basic = pub.find((p) => p.code === "basic")!;
    expect(basic.pricePerUserMonthly).toBe(88);
    expect(basic.savingsPct).toBe(Math.round((1 - 880 / 12 / 88) * 100));
    await request(srv()).put("/platform/plans/basic").set(auth(admin)).send({ priceMonthly: 230, priceYearly: 2300, trialDays: 14 }).expect(200);
  });

  it("الرخصة = المقاعد المختارة عند التسجيل؛ /staff/seats يعكس المرخّص والمتاح", async () => {
    const t = await signup(2);
    const s = await seatsOf(t);
    expect(s.limit).toBe(2); // رخصة التجربة = المختارة
    expect(s.used).toBe(1); // المالك فقط
    expect(s.available).toBe(1);
    expect(s.planName).toBeTruthy();
  });

  it("إضافة ضمن الرخصة تنجح، وتجاوزها ⇒ 402 (SEAT_LIMIT_REACHED)", async () => {
    const t = await signup(2); // رخصة 2، مستخدم واحد ⇒ متاح 1
    await request(srv()).post("/staff").set(auth(t)).send(newUser(`s1-${uniq()}@seat-broker.sa`)).expect(201); // ⇒ 2/2
    expect((await seatsOf(t)).available).toBe(0);
    const blocked = await request(srv()).post("/staff").set(auth(t)).send(newUser(`s2-${uniq()}@seat-broker.sa`)).expect(402); // تجاوز الرخصة
    expect(blocked.body.code).toBe("SEAT_LIMIT_REACHED");
    expect(blocked.body.licensed).toBe(2);
  });

  it("شراء مقاعد يرفع الرخصة فيُسمح بإضافة المزيد", async () => {
    const t = await signup(1); // رخصة 1، المالك فقط ⇒ ممتلئة
    await request(srv()).post("/staff").set(auth(t)).send(newUser(`full-${uniq()}@seat-broker.sa`)).expect(402);
    // شراء مقعدين ⇒ فاتورة ⇒ تأكيد الدفع (sandbox) ⇒ الرخصة 3
    const co = await request(srv()).post("/billing/seats/checkout").set(auth(t)).send({ addSeats: 2 }).expect(201);
    expect(co.body.invoiceId).toBeTruthy();
    expect(Number(co.body.amount)).toBeGreaterThan(0);
    await request(srv()).post(`/billing/${co.body.invoiceId}/confirm`).set(auth(t)).expect(201);
    const s = await seatsOf(t);
    expect(s.limit).toBe(3); // 1 + 2 مشتراة
    expect(s.available).toBe(2);
    await request(srv()).post("/staff").set(auth(t)).send(newUser(`after-${uniq()}@seat-broker.sa`)).expect(201); // صار مسموحًا
  });

  it("عزل: مستخدم الشركة لا يعدّل الباقات (نطاق المنصّة فقط) ⇒ 403", () =>
    request(srv()).put("/platform/plans/basic").set(auth(omar)).send({ priceMonthly: 1 }).expect(403));

  // ————————————————— إنهاء الخدمة (المغادرة/الاستقالة) — نقل الرخصة/إلغاؤها —————————————————

  const ownerIdOf = async (t: string) => {
    const staff = (await request(srv()).get("/staff").set(auth(t)).expect(200)).body as Array<{ id: string; email: string }>;
    return staff.find((u) => u.email.startsWith("seatowner"))!.id;
  };

  it("إنهاء الخدمة يحرّر المقعد ويعطّل الحساب، مع نقل المهام لموظف آخر (الرخصة تبقى لبديل)", async () => {
    const t = await signup(3);
    const a = await request(srv()).post("/staff").set(auth(t)).send(newUser(`off-a-${uniq()}@seat-broker.sa`)).expect(201);
    expect((await seatsOf(t)).used).toBe(2); // المالك + A
    const ownerId = await ownerIdOf(t);
    const res = await request(srv()).post(`/staff/${a.body.id}/offboard`).set(auth(t)).send({ reassignToId: ownerId }).expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.reassignedToEmail).toBeTruthy();
    expect(res.body.licenseCancelled).toBe(false);
    const s = await seatsOf(t);
    expect(s.used).toBe(1); // تحرّر مقعد A
    expect(s.limit).toBe(3); // الرخصة باقية (لبديل)
    expect(s.available).toBe(2);
    const after = (await request(srv()).get("/staff").set(auth(t)).expect(200)).body as Array<{ id: string; status: string }>;
    expect(after.find((u) => u.id === a.body.id)!.status).toBe("DISABLED");
  });

  it("إنهاء الخدمة مع إلغاء الرخصة يقلّل المقاعد المدفوعة", async () => {
    const t = await signup(3);
    const b = await request(srv()).post("/staff").set(auth(t)).send(newUser(`off-b-${uniq()}@seat-broker.sa`)).expect(201);
    const res = await request(srv()).post(`/staff/${b.body.id}/offboard`).set(auth(t)).send({ cancelSeat: true }).expect(200);
    expect(res.body.licenseCancelled).toBe(true);
    const s = await seatsOf(t);
    expect(s.used).toBe(1);
    expect(s.limit).toBe(2); // 3 − 1 (لا تقلّ عن المستخدَم)
  });

  it("لا يمكن إنهاء خدمة الحساب لنفسه ⇒ 400", async () => {
    const t = await signup(2);
    await request(srv()).post(`/staff/${await ownerIdOf(t)}/offboard`).set(auth(t)).send({}).expect(400);
  });
});
