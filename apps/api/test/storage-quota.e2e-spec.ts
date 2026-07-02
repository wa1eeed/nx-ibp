/**
 * اختبار حصص التخزين لكل مستأجر (D1):
 *  - الحجز الذرّي عند طلب رابط الرفع؛ تجاوز الحصّة ⇒ 403.
 *  - التلميتري (/documents/usage) يعكس الاستهلاك والحصّة والنسبة.
 *  - العزل: حصّة كل مستأجر مستقلّة.
 * الحصّة من entitlement storage.quotaMb (نضبطها صغيرة للباقة basic عبر سوبر أدمن المنصة).
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

const MB = 1024 * 1024;

describe("حصص التخزين (e2e)", () => {
  let app: INestApplication;
  let platform: string;
  const srv = () => app.getHttpServer();
  const uniq = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function newOwner(): Promise<string> {
    const res = await request(srv()).post("/signup").send({ companyName: `تخزين ${uniq()}`, adminName: "مالك", adminEmail: `stq-${uniq()}@brk.sa`, password: "Owner1Pass" }).expect(201);
    return res.body.accessToken;
  }
  const uploadUrl = (token: string, sizeBytes: number) =>
    request(srv()).post("/documents/upload-url").set(auth(token)).send({ entityType: "client", entityId: "c1", fileName: "f.pdf", mime: "application/pdf", sizeBytes });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    platform = (await request(srv()).post("/platform/login").send({ email: "admin@ibp-platform.sa", password: "Passw0rd!" })).body.accessToken;
    // اضبط حصّة باقة basic صغيرة (15MB) لاختبار التجاوز بسهولة
    await request(srv()).post("/platform/plans/basic/entitlements").set(auth(platform))
      .send({ featureKey: "storage.quotaMb", mode: "QUOTA", numericValue: 15 }).expect(200);
  });
  afterAll(async () => { await app?.close(); });

  it("التلميتري الابتدائي: 0 مستخدَم من الحصّة", async () => {
    const t = await newOwner();
    const u = await request(srv()).get("/documents/usage").set(auth(t)).expect(200);
    expect(u.body.usedBytes).toBe(0);
    expect(u.body.quotaMb).toBe(15);
    expect(u.body.percentUsed).toBe(0);
  });

  it("الحجز الذرّي: أوّل رفع ضمن الحصّة ينجح ويُحدّث الاستهلاك", async () => {
    const t = await newOwner();
    await uploadUrl(t, 9 * MB).expect(201);
    const u = await request(srv()).get("/documents/usage").set(auth(t)).expect(200);
    expect(u.body.usedBytes).toBe(9 * MB);
    expect(u.body.fileCount).toBe(1);
    expect(u.body.percentUsed).toBe(60); // 9/15
  });

  it("تجاوز الحصّة ⇒ 403 (الحجز الثاني يتخطّى الحدّ)", async () => {
    const t = await newOwner();
    await uploadUrl(t, 9 * MB).expect(201);        // مستخدَم 9MB
    await uploadUrl(t, 9 * MB).expect(403);        // 9+9=18 > 15 ⇒ رفض
    const u = await request(srv()).get("/documents/usage").set(auth(t)).expect(200);
    expect(u.body.usedBytes).toBe(9 * MB);         // لم يُحجز الثاني
    expect(u.body.fileCount).toBe(1);
  });

  it("العزل: حصّة كل مستأجر مستقلّة", async () => {
    const a = await newOwner();
    const b = await newOwner();
    await uploadUrl(a, 9 * MB).expect(201);
    const ub = await request(srv()).get("/documents/usage").set(auth(b)).expect(200);
    expect(ub.body.usedBytes).toBe(0); // مستأجر b غير متأثّر
  });

  it("حجم ملف مفرد يتجاوز الحصّة كلّها ⇒ 403", async () => {
    const t = await newOwner();
    // per-file max لـ basic = 10MB، والحصّة 15MB؛ نرفع 10MB ثم 10MB (المجموع يتجاوز)
    await uploadUrl(t, 10 * MB).expect(201);
    await uploadUrl(t, 10 * MB).expect(403);
  });
});
