/**
 * مكافحة غسل الأموال (AML/CFT — §6.2، امتثال ترخيصي):
 *  - تقييم مخاطر العميل بعوامل موزونة (تطابق العقوبات ⇒ مرتفع حتمًا) + تحديث ملخّص العميل.
 *  - فرز العقوبات/PEP (نظيف/تطابق محتمل/مؤكّد) + التصرّف (إيجابي كاذب/تصعيد).
 *  - سجلّ بلاغات الاشتباه (STR): مسودّة ⇒ مرفوع ⇒ مغلق + مؤشّر غير معروف 400.
 *  - النظرة العامة/التقرير + RBAC (compliance) + العزل بين المستأجرين.
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

describe("مكافحة غسل الأموال (e2e)", () => {
  let app: INestApplication;
  const srv = () => app.getHttpServer();
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const uniq = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  let gm: string; // الخليج (له compliance)
  let amanGm: string; // الأمان (عزل)

  const login = async (email: string) => (await request(srv()).post("/auth/login").send({ email, password: "Passw0rd!" })).body.accessToken as string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    gm = await login("waleed@gulf-demo.sa");
    amanGm = await login("omar@aman-demo.sa");
  });
  afterAll(async () => { await app?.close(); });

  it("تقييم المخاطر: عوامل موزونة ⇒ درجة/مستوى · تطابق العقوبات ⇒ مرتفع حتمًا · يُحدّث ملخّص العميل", async () => {
    const clients = (await request(srv()).get("/aml/clients").set(auth(gm)).expect(200)).body as Array<{ id: string; amlRiskLevel: string | null }>;
    expect(clients.length).toBeGreaterThan(0);
    const cid = clients[0].id;

    // PEP + دولة عالية الخطورة ⇒ 30+20 = 50 ⇒ متوسّط
    const med = (await request(srv()).post(`/aml/clients/${cid}/assess`).set(auth(gm)).send({ factors: { pep: true, highRiskCountry: true } }).expect(201)).body;
    expect(med.score).toBe(50);
    expect(med.level).toBe("medium");
    expect(new Date(med.reviewDue).getTime()).toBeGreaterThan(Date.now());

    // تطابق عقوبات ⇒ مرتفع حتمًا (حتى لو لم تبلغ الدرجة 60 بمفردها)
    const high = (await request(srv()).post(`/aml/clients/${cid}/assess`).set(auth(gm)).send({ factors: { sanctionsHit: true } }).expect(201)).body;
    expect(high.level).toBe("high");

    // آخر تقييم يُبصَم على ملخّص العميل
    const after = (await request(srv()).get(`/aml/clients/${cid}`).set(auth(gm)).expect(200)).body;
    expect(after.client.amlRiskLevel).toBe("high");
    expect(after.assessments.length).toBeGreaterThanOrEqual(2); // تاريخ التقييمات محفوظ
  });

  it("الفرز: اسم نظيف ⇒ clear · اسم بقائمة ⇒ confirmed/potential · التصرّف يُحدّث السجلّ", async () => {
    // اسم فريد لا يطابق شيئًا ⇒ نظيف + تصرّف تلقائي cleared
    const clean = (await request(srv()).post("/aml/screen").set(auth(gm)).send({ name: `عميل نظيف ${uniq()}` }).expect(201)).body;
    expect(clean.result).toBe("clear");
    expect(clean.disposition).toBe("cleared");

    // تطابق تامّ مع قائمة العقوبات التجريبية ⇒ confirmed_match + بانتظار التصرّف
    const hit = (await request(srv()).post("/aml/screen").set(auth(gm)).send({ name: "Sanctioned Trading Co" }).expect(201)).body;
    expect(hit.result).toBe("confirmed_match");
    expect(hit.disposition).toBe("pending");
    expect(hit.matches.length).toBeGreaterThan(0);

    // التصرّف: تصعيد التطابق (تطابق حقيقي ⇒ يستوجب بلاغًا)
    const disp = (await request(srv()).put(`/aml/screenings/${hit.id}/disposition`).set(auth(gm)).send({ disposition: "escalated", note: "تطابق حقيقي" }).expect(200)).body;
    expect(disp.disposition).toBe("escalated");

    // يظهر في سجلّ الفرز
    const list = (await request(srv()).get("/aml/screenings").set(auth(gm)).expect(200)).body as Array<{ id: string }>;
    expect(list.some((x) => x.id === hit.id)).toBe(true);
  });

  it("بلاغ الاشتباه (STR): مؤشّر غير معروف 400 · إنشاء مسودّة ⇒ رفع ⇒ إغلاق", async () => {
    // مؤشّر غير معروف ⇒ 400
    await request(srv()).post("/aml/reports").set(auth(gm)).send({ subject: "x", description: "yyy", indicators: ["nope"] }).expect(400);

    // إنشاء مسودّة
    const str = (await request(srv()).post("/aml/reports").set(auth(gm)).send({ subject: `اشتباه ${uniq()}`, description: "نمط معاملات غير معتاد", indicators: ["unusual_volume", "structuring"] }).expect(201)).body;
    expect(str.sequenceNo).toMatch(/^STR-/);
    expect(str.status).toBe("draft");

    // رفع البلاغ ⇒ filed + filedAt
    const filed = (await request(srv()).put(`/aml/reports/${str.id}`).set(auth(gm)).send({ status: "filed", reference: "SAFIU-2026-001" }).expect(200)).body;
    expect(filed.status).toBe("filed");
    expect(filed.filedAt).toBeTruthy();

    // إغلاق ⇒ closed + closedAt
    const closed = (await request(srv()).put(`/aml/reports/${str.id}`).set(auth(gm)).send({ status: "closed" }).expect(200)).body;
    expect(closed.status).toBe("closed");
    expect(closed.closedAt).toBeTruthy();
  });

  it("النظرة العامة/التقرير: مؤشّرات مجمّعة", async () => {
    const ov = (await request(srv()).get("/aml/overview").set(auth(gm)).expect(200)).body;
    expect(Array.isArray(ov.riskDistribution)).toBe(true);
    expect(typeof ov.unassessed).toBe("number");
    expect(Array.isArray(ov.screeningsByResult)).toBe(true);
    const rep = (await request(srv()).get("/aml/report").set(auth(gm)).expect(200)).body;
    expect(rep.totalClients).toBeGreaterThan(0);
    expect(typeof rep.coveragePct).toBe("number");
    expect(rep.strFiled).toBeGreaterThanOrEqual(1); // البلاغ المُغلق أعلاه يُحتسب مرفوعًا
  });

  it("RBAC: موظف بلا صلاحية الالتزام ⇒ 403", async () => {
    const email = `noncompliance-aml-${uniq()}@gulf-demo.sa`;
    await request(srv()).post("/staff").set(auth(gm)).send({ fullName: "موظف", email, password: "Worker1Pass", roleName: `بلا التزام ${uniq()}`, permissions: [{ module: "clients", canAccess: true, canCreate: false, canEdit: false, canDelete: false }] }).expect(201);
    const staff = (await request(srv()).post("/auth/login").send({ email, password: "Worker1Pass" })).body.accessToken;
    await request(srv()).get("/aml/overview").set(auth(staff)).expect(403);
    await request(srv()).post("/aml/screen").set(auth(staff)).send({ name: "x y" }).expect(403);
  });

  it("العزل: الأمان لا يرى فرز الخليج", async () => {
    // اسم فريد يفرزه الخليج
    const tag = `عزل ${uniq()}`;
    const gulfScreen = (await request(srv()).post("/aml/screen").set(auth(gm)).send({ name: tag }).expect(201)).body;
    // الأمان يستعرض فرزه ⇒ لا يحوي سجلّ الخليج
    const amanList = (await request(srv()).get("/aml/screenings").set(auth(amanGm)).expect(200)).body as Array<{ id: string }>;
    expect(amanList.some((x) => x.id === gulfScreen.id)).toBe(false);
  });
});
