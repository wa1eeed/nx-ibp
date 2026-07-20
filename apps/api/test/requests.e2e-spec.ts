/**
 * اختبار محرّك النموذج الديناميكي + بوّابة الالتزام (تحقّق المرحلة 3):
 *  - اختيار فرع يولّد التحقّق الصحيح حسب نوع المنتج (طبي/مركبات/حياة).
 *  - لا طلب أسعار قبل اعتماد الالتزام للعميل.
 *  - حمولة غير صحيحة ⇒ 422.
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

const PERIOD = { startDate: "2026-01-01", endDate: "2026-12-31", currency: "SAR" };

describe("النموذج الديناميكي والالتزام (e2e)", () => {
  let app: INestApplication;
  let gm: string; // مدير عام — الخليج
  let compliance: string; // مدير الالتزام — الخليج
  let sales: string; // مدير المبيعات — الخليج
  let amanGm: string; // مدير عام — الأمان

  async function login(email: string) {
    const r = await request(app.getHttpServer()).post("/auth/login").send({ email, password: "Passw0rd!" });
    return r.body.accessToken as string;
  }
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    gm = await login("waleed@gulf-demo.sa");
    compliance = await login("huda@gulf-demo.sa");
    sales = await login("sara@gulf-demo.sa");
    amanGm = await login("omar@aman-demo.sa");
  });

  afterAll(async () => {
    await app?.close();
  });

  // ----- الكتالوج -----
  it("الكتالوج الموسّع يضمّ كل فروع الوساطة السعودية + ~48 خطًا فرعيًا", async () => {
    const res = await request(app.getHttpServer()).get("/catalog").set(auth(gm)).expect(200);
    const codes = res.body.map((c: { code: string }) => c.code);
    expect(codes).toEqual(expect.arrayContaining(["MED", "MOT", "PRP", "ENG", "MAR", "GEN", "AVI", "ENR", "BND", "LIF"]));
    const lineCount = res.body.reduce((s: number, c: { lines: unknown[] }) => s + c.lines.length, 0);
    expect(lineCount).toBeGreaterThanOrEqual(45);
  });

  it("مخطط الطبي الجماعي يحوي كتلة التابعين", async () => {
    const res = await request(app.getHttpServer()).get("/catalog/lines/GMI").set(auth(gm)).expect(200);
    expect(res.body.formSchema.blocks.map((b: { key: string }) => b.key)).toContain("members");
  });

  // ----- بوّابة الالتزام -----
  let clientId: string;
  it("إنشاء عميل جديد يبدأ بحالة التزام PENDING", async () => {
    const cr = String(Date.now()).slice(-10);
    const res = await request(app.getHttpServer())
      .post("/clients")
      .set(auth(gm))
      .send({ type: "CORPORATE", name: "عميل اختبار النموذج", crNumber: cr })
      .expect(201);
    expect(res.body.complianceStatus).toBe("PENDING");
    expect(res.body.code).toMatch(/^CLI-/);
    clientId = res.body.id;
  });

  const medicalValid = () => ({
    clientId,
    productLineCode: "GMI",
    base: { insuredName: "شركة الاختبار", network: "standard", annualLimit: 500000, ...PERIOD },
    blocks: { members: [{ name: "أحمد", nationalId: "1234567890", relation: "employee", dob: "1990-01-01", gender: "male", tier: "a" }] },
  });

  it("لا يُقبل طلب قبل اعتماد الالتزام ⇒ 409", () =>
    request(app.getHttpServer()).post("/requests").set(auth(gm)).send(medicalValid()).expect(409));

  it("مدير المبيعات لا يملك صلاحية اعتماد الالتزام ⇒ 403", () =>
    request(app.getHttpServer())
      .post(`/clients/${clientId}/compliance`)
      .set(auth(sales))
      .send({ decision: "APPROVED" })
      .expect(403));

  it("مدير الالتزام يعتمد العميل ⇒ 200", () =>
    request(app.getHttpServer())
      .post(`/clients/${clientId}/compliance`)
      .set(auth(compliance))
      .send({ decision: "APPROVED", note: "مطابق" })
      .expect(200));

  // ----- التحقّق حسب نوع المنتج -----
  it("طلب طبي صحيح بعد الاعتماد ⇒ 201 برقم تسلسل", async () => {
    const res = await request(app.getHttpServer()).post("/requests").set(auth(gm)).send(medicalValid()).expect(201);
    expect(res.body.sequenceNo).toMatch(/^SL-MED-/);
  });

  it("طلب طبي بتابع بلا هوية ⇒ 422", () =>
    request(app.getHttpServer())
      .post("/requests")
      .set(auth(gm))
      .send({ ...medicalValid(), blocks: { members: [{ name: "بلا هوية", relation: "employee", dob: "1990-01-01", gender: "male" }] } })
      .expect(422));

  it("طلب طبي بلا حقل أساسي مطلوب (network) ⇒ 422", () =>
    request(app.getHttpServer())
      .post("/requests")
      .set(auth(gm))
      .send({ ...medicalValid(), base: { insuredName: "x", annualLimit: 1000, ...PERIOD } })
      .expect(422));

  it("طلب مركبات صحيح (كتلة المركبات) ⇒ 201", () =>
    request(app.getHttpServer())
      .post("/requests")
      .set(auth(gm))
      .send({
        clientId,
        productLineCode: "MCI",
        base: { insuredName: "أسطول", coverType: "comprehensive", ...PERIOD },
        blocks: { vehicles: [{ make: "Toyota", model: "Camry", year: 2022, plate: "أ ب ج 1234", vin: "VIN123456", value: 90000, usage: "private" }] },
      })
      .expect(201));

  it("طلب حياة لأجل صحيح (كتلة الأرواح) ⇒ 201", () =>
    request(app.getHttpServer())
      .post("/requests")
      .set(auth(gm))
      .send({
        clientId,
        productLineCode: "TRM",
        base: { insuredName: "مؤمّن", termYears: 20, premiumFrequency: "annual", ...PERIOD },
        blocks: { lives: [{ name: "خالد", nationalId: "1098765432", dob: "1985-05-05", gender: "male", sumAssured: 1000000 }] },
      })
      .expect(201));

  it("قائمة الطلبات معزولة: الأمان لا يرى طلبات الخليج", async () => {
    const res = await request(app.getHttpServer()).get("/requests").set(auth(amanGm)).expect(200);
    expect(res.body.every((r: { tenantId: string }) => r.tenantId === "demo-tenant-2")).toBe(true);
  });

  it("تفاصيل الطلب تتضمّن صفوف الكتلة", async () => {
    const created = await request(app.getHttpServer()).post("/requests").set(auth(gm)).send(medicalValid()).expect(201);
    const detail = await request(app.getHttpServer()).get(`/requests/${created.body.id}`).set(auth(gm)).expect(200);
    expect(detail.body.blockRows.length).toBeGreaterThanOrEqual(1);
    expect(detail.body.blockRows[0].blockKey).toBe("members");
  });

  it("تعديل طلب DRAFT (PATCH): يستبدل الحقول وصفوف الكتل ويُحفظ", async () => {
    const created = await request(app.getHttpServer()).post("/requests").set(auth(gm)).send(medicalValid()).expect(201);
    const rid = created.body.id;
    await request(app.getHttpServer()).patch(`/requests/${rid}`).set(auth(gm)).send({
      base: { insuredName: "الاسم المُعدَّل", network: "vip", annualLimit: 750000, ...PERIOD },
      blocks: { members: [
        { name: "سالم", nationalId: "1122334455", relation: "employee", dob: "1988-03-03", gender: "male", tier: "a" },
        { name: "منى", nationalId: "1122334466", relation: "spouse", dob: "1990-06-06", gender: "female", tier: "a" },
      ] },
    }).expect(200);
    const detail = await request(app.getHttpServer()).get(`/requests/${rid}`).set(auth(gm)).expect(200);
    expect(detail.body.base.insuredName).toBe("الاسم المُعدَّل");
    expect(detail.body.base.network).toBe("vip");
    expect(detail.body.blockRows.length).toBe(2); // استُبدلت صفوف الكتلة (صفّ ⇒ صفّان)
  });

  it("تعديل طلب بحمولة غير صحيحة ⇒ 422", async () => {
    const created = await request(app.getHttpServer()).post("/requests").set(auth(gm)).send(medicalValid()).expect(201);
    await request(app.getHttpServer()).patch(`/requests/${created.body.id}`).set(auth(gm))
      .send({ base: { insuredName: "بلا شبكة", annualLimit: 1000, ...PERIOD } }).expect(422); // network مطلوب
  });

  // ----- نطاق المنتجات (H): صلاحية على مستوى فرع التأمين، متوافقة رجعيًا -----
  it("نطاق المنتجات: حصر موظف بفرع ⇒ تصفية القائمة + منع الإنشاء خارجه + تراجع يعيد الكل", async () => {
    const srv = app.getHttpServer();
    // معرّف مدير المبيعات (sara)
    const staffList = (await request(srv).get("/staff").set(auth(gm)).expect(200)).body as Array<{ id: string; email: string }>;
    const saraId = staffList.find((u) => u.email === "sara@gulf-demo.sa")!.id;

    // قبل التقييد: sara ترى طلبات بفروع متعددة (GMI + MCI أُنشئت أعلاه)
    const before = (await request(srv).get("/requests").set(auth(sales)).expect(200)).body as Array<{ productLineCode: string }>;
    const linesBefore = new Set(before.map((r) => r.productLineCode));
    expect(linesBefore.has("GMI")).toBe(true);
    expect(linesBefore.has("MCI")).toBe(true);

    // كود فرع غير موجود ⇒ 400
    await request(srv).post(`/staff/${saraId}/product-scope`).set(auth(gm)).send({ lines: ["NOPE"] }).expect(400);

    // احصر sara بالطبي الجماعي (GMI) فقط
    await request(srv).post(`/staff/${saraId}/product-scope`).set(auth(gm)).send({ lines: ["GMI"] }).expect(200);

    // القائمة الآن مقصورة على GMI
    const scoped = (await request(srv).get("/requests").set(auth(sales)).expect(200)).body as Array<{ productLineCode: string }>;
    expect(scoped.length).toBeGreaterThan(0);
    expect(scoped.every((r) => r.productLineCode === "GMI")).toBe(true);

    // إنشاء طلب خارج النطاق (مركبات MCI) ⇒ 403 نطاق المنتجات (قبل فحوص أخرى)
    await request(srv).post("/requests").set(auth(sales)).send({ clientId, productLineCode: "MCI", base: {}, blocks: {} }).expect(403);

    // تراجع: بلا تقييد ⇒ ترى كل الفروع مجددًا (متوافق رجعيًا)
    await request(srv).post(`/staff/${saraId}/product-scope`).set(auth(gm)).send({ lines: [] }).expect(200);
    const after = (await request(srv).get("/requests").set(auth(sales)).expect(200)).body as Array<{ productLineCode: string }>;
    expect(new Set(after.map((r) => r.productLineCode)).has("MCI")).toBe(true);
  });
});
