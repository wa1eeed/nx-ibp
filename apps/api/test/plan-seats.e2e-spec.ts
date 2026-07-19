/**
 * اختبار نموذج التسعير **لكل مستخدم** (بلا سقف من الباقة) + تحكّم السوبر أدمن بالأسعار:
 *  - السوبر أدمن يعدّل السعر الشهري/السنوي ومدّة التجربة ⇒ يظهر في الكتالوج العام مع نسبة التوفير.
 *  - `GET /staff/seats` يعيد `limit=null` (بلا حدّ) — التسعير لكل مستخدم.
 *  - إضافة مستخدم **تنجح بلا سقف** ويتزامن العدّاد المستخدَم (أساس الفوترة).
 *  - عزل: مستخدم الشركة لا يعدّل الباقات (نطاق المنصّة فقط).
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

describe("التسعير لكل مستخدم (e2e)", () => {
  let app: INestApplication;
  let admin: string; // سوبر أدمن المنصّة
  let omar: string; // مدير عام الأمان (باقة basic)

  const srv = () => app.getHttpServer();
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const perm = (m: string) => ({ module: m, canAccess: true, canCreate: false, canEdit: false, canDelete: false, canRevert: false });
  const newUser = (email: string) => ({ fullName: "مقعد اختبار", email, password: "Passw0rd1", roleName: `دور-${email}`, permissions: [perm("dashboard")] });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    admin = (await request(srv()).post("/platform/login").send({ email: "admin@ibp-platform.sa", password: "Passw0rd!" })).body.accessToken;
    omar = (await request(srv()).post("/auth/login").send({ email: "omar@aman-demo.sa", password: "Passw0rd!" })).body.accessToken;
  });

  afterAll(async () => {
    await request(srv()).put("/platform/plans/basic").set(auth(admin)).send({ priceMonthly: 230, priceYearly: 2300, trialDays: 14 }); // استعادة الافتراضي (تسعير لكل مستخدم)
    await app?.close();
  });

  it("سوبر أدمن يعدّل سعر الباقة (شهري/سنوي) ومدة التجربة ⇒ يظهر في الكتالوج العام", async () => {
    const r = await request(srv()).put("/platform/plans/basic").set(auth(admin)).send({ priceMonthly: 88, priceYearly: 880, trialDays: 21 }).expect(200);
    expect(Number(r.body.priceMonthly)).toBe(88);
    expect(Number(r.body.priceYearly)).toBe(880);
    expect(r.body.trialDays).toBe(21);
    const pub = (await request(srv()).get("/signup/plans").expect(200)).body as Array<{ code: string; pricePerUserMonthly: number; trialDays: number; savingsPct: number }>;
    const basic = pub.find((p) => p.code === "basic")!;
    expect(basic.pricePerUserMonthly).toBe(88);
    expect(basic.trialDays).toBe(21);
    expect(basic.savingsPct).toBe(Math.round((1 - 880 / 12 / 88) * 100)); // ≈17%
    await request(srv()).put("/platform/plans/basic").set(auth(admin)).send({ priceMonthly: 230, priceYearly: 2300, trialDays: 14 }).expect(200);
  });

  it("المقاعد بلا سقف من الباقة: /staff/seats يعيد limit=null (تسعير لكل مستخدم)", async () => {
    const s = (await request(srv()).get("/staff/seats").set(auth(omar)).expect(200)).body as { used: number; limit: number | null; planName: string | null };
    expect(typeof s.used).toBe("number");
    expect(s.limit).toBeNull(); // بلا حدّ — التسعير لكل مستخدم
    expect(s.planName).toBeTruthy();
  });

  it("إضافة مستخدم تنجح بلا سقف، ويتزامن العدّاد المستخدَم (أساس الفوترة)", async () => {
    const before = (await request(srv()).get("/staff/seats").set(auth(omar)).expect(200)).body as { used: number };
    const uniq = String(Date.now()).slice(-8);
    await request(srv()).post("/staff").set(auth(omar)).send(newUser(`seat-${uniq}@aman-demo.sa`)).expect(201);
    const after = (await request(srv()).get("/staff/seats").set(auth(omar)).expect(200)).body as { used: number };
    expect(after.used).toBe(before.used + 1); // الفوترة تتبع العدد الفعلي
  });

  it("عزل: مستخدم الشركة لا يعدّل الباقات (نطاق المنصّة فقط) ⇒ 403", () =>
    request(srv()).put("/platform/plans/basic").set(auth(omar)).send({ priceMonthly: 1 }).expect(403));
});
