/**
 * اختبار حدّ مقاعد الباقة (عدد المستخدمين) — تحقّق:
 *  - سوبر أدمن المنصّة يعدّل `seatLimit` للباقة، ويظهر في قائمة الباقات.
 *  - الشركة ترى مقاعدها المستخدَمة/الحدّ حسب باقتها (`GET /staff/seats`).
 *  - إضافة مستخدم تُرفَض (403) عند بلوغ الحدّ، وتنجح بعد رفعه.
 *  - عزل: مستخدم الشركة لا يعدّل حدّ الباقات (نطاق المنصّة فقط).
 * يُجرى على مستأجر الأمان (باقة basic) لعزله عن بقيّة الاختبارات.
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

describe("حدّ مقاعد الباقة (e2e)", () => {
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
    await request(srv()).put("/platform/plans/basic").set(auth(admin)).send({ seatLimit: 5 }); // استعادة الافتراضي
    await app?.close();
  });

  it("سوبر أدمن المنصّة يعدّل حدّ مستخدمي الباقة ويظهر في الباقات", async () => {
    const r = await request(srv()).put("/platform/plans/basic").set(auth(admin)).send({ seatLimit: 9 }).expect(200);
    expect(r.body.seatLimit).toBe(9);
    const plans = (await request(srv()).get("/platform/plans").set(auth(admin)).expect(200)).body as Array<{ code: string; seatLimit: number }>;
    expect(plans.find((p) => p.code === "basic")?.seatLimit).toBe(9);
  });

  it("سوبر أدمن يعدّل سعر الباقة (شهري/سنوي) ومدة التجربة ⇒ يظهر في الكتالوج العام", async () => {
    const r = await request(srv()).put("/platform/plans/basic").set(auth(admin)).send({ priceMonthly: 88, priceYearly: 880, trialDays: 21 }).expect(200);
    expect(Number(r.body.priceMonthly)).toBe(88);
    expect(Number(r.body.priceYearly)).toBe(880);
    expect(r.body.trialDays).toBe(21);
    // الكتالوج العام (اللاندينق/التسجيل) يعكس التغيير + يحسب نسبة التوفير
    const pub = (await request(srv()).get("/signup/plans").expect(200)).body as Array<{ code: string; pricePerUserMonthly: number; pricePerUserYearly: number; trialDays: number; savingsPct: number }>;
    const basic = pub.find((p) => p.code === "basic")!;
    expect(basic.pricePerUserMonthly).toBe(88);
    expect(basic.trialDays).toBe(21);
    expect(basic.savingsPct).toBe(Math.round((1 - 880 / 12 / 88) * 100)); // ≈17%
    // استعادة الافتراضي
    await request(srv()).put("/platform/plans/basic").set(auth(admin)).send({ priceMonthly: 79, priceYearly: 790, trialDays: 14 }).expect(200);
  });

  it("الشركة ترى مقاعدها المستخدَمة/الحدّ حسب باقتها", async () => {
    const s = (await request(srv()).get("/staff/seats").set(auth(omar)).expect(200)).body as { used: number; limit: number | null; planName: string | null };
    expect(typeof s.used).toBe("number");
    expect(s.limit).toBe(9); // ضُبط في الاختبار السابق
    expect(s.planName).toBeTruthy();
  });

  it("إضافة مستخدم تُرفَض عند بلوغ الحدّ (403)، وتنجح بعد رفعه", async () => {
    const before = (await request(srv()).get("/staff/seats").set(auth(omar)).expect(200)).body as { used: number };
    const uniq = String(Date.now()).slice(-8);
    // اضبط الحدّ = المستخدَم الحالي ⇒ عند الحدّ تمامًا
    await request(srv()).put("/platform/plans/basic").set(auth(admin)).send({ seatLimit: before.used }).expect(200);
    await request(srv()).post("/staff").set(auth(omar)).send(newUser(`seat-block-${uniq}@aman-demo.sa`)).expect(403);
    // ارفع الحدّ ⇒ تنجح الإضافة
    await request(srv()).put("/platform/plans/basic").set(auth(admin)).send({ seatLimit: before.used + 3 }).expect(200);
    await request(srv()).post("/staff").set(auth(omar)).send(newUser(`seat-ok-${uniq}@aman-demo.sa`)).expect(201);
    // المقاعد المستخدَمة زادت واحدًا
    const after = (await request(srv()).get("/staff/seats").set(auth(omar)).expect(200)).body as { used: number };
    expect(after.used).toBe(before.used + 1);
  });

  it("عزل: مستخدم الشركة لا يعدّل حدّ الباقات (نطاق المنصّة فقط) ⇒ 403", () =>
    request(srv()).put("/platform/plans/basic").set(auth(omar)).send({ seatLimit: 50 }).expect(403));
});
