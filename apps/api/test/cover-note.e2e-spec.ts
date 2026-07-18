/**
 * مذكرة التغطية المؤقتة (Cover Note — §4.2):
 *  - تُصدَر لطلب مُسنَد (AWARDED) بشروط العرض المختار؛ منع التكرار · منع على طلب غير مُسنَد.
 *  - العميل يراها في بوّابته + مستندها المطبوع؛ تُستبدَل تلقائيًا عند إصدار الوثيقة.
 *  - العزل بين المستأجرين + RBAC (الإنتاج).
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

const PERIOD = { startDate: "2026-06-01", endDate: "2027-05-31" };

describe("مذكرة التغطية المؤقتة (e2e)", () => {
  let app: INestApplication;
  const srv = () => app.getHttpServer();
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  let gm: string; // الخليج (production)
  let fahd: string; // بوّابة الفهد (cl-fahd)
  let nukhba: string; // بوّابة النخبة (مستأجر آخر — عزل)

  const login = async (email: string) => (await request(srv()).post("/auth/login").send({ email, password: "Passw0rd!" })).body.accessToken as string;
  const pLogin = async (email: string) => (await request(srv()).post("/portal/login").send({ email, password: "Passw0rd!" })).body.accessToken as string;

  /** عميل جديد مُعتمَد الالتزام (لاختبار الإصدار دون تلويث عدّاد وثائق عميل مزروع). */
  async function freshClient(): Promise<string> {
    const cr = String(Date.now()).slice(-8) + String(10 + Math.floor(Math.random() * 89));
    const c = await request(srv()).post("/clients").set(auth(gm)).send({ type: "CORPORATE", name: "عميل مذكرة", crNumber: cr });
    await request(srv()).post(`/clients/${c.body.id}/compliance`).set(auth(gm)).send({ decision: "APPROVED" });
    return c.body.id;
  }

  /** ينشئ طلبًا لعميل + طلب أسعار + عرضًا ويُسنِده (Firm Order ⇒ AWARDED)، ويعيد المعرّفات. */
  async function makeAwardedRequest(clientId = "cl-fahd"): Promise<{ requestId: string }> {
    const req = await request(srv()).post("/requests").set(auth(gm)).send({
      clientId, productLineCode: "GMI",
      base: { insuredName: "الفهد", network: "standard", annualLimit: 500000, ...PERIOD },
      blocks: { members: [{ name: "أ", nationalId: "1234567890", relation: "employee", dob: "1990-01-01", gender: "male" }] },
    });
    const slip = await request(srv()).post("/slips").set(auth(gm)).send({ requestId: req.body.id });
    const q = await request(srv()).post(`/slips/${slip.body.id}/quotations`).set(auth(gm)).send({ insurerName: "بوبا", sumInsured: 1000000, premium: 60000, vat: 9000, totalPremium: 69000, deductible: 500, limit: 1000000 });
    await request(srv()).post(`/slips/${slip.body.id}/select`).set(auth(gm)).send({ quotationId: q.body.id }).expect(200);
    return { requestId: req.body.id };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    gm = await login("waleed@gulf-demo.sa");
    fahd = await pLogin("portal@alfahd.sa");
    nukhba = await pLogin("portal@nukhba.sa");
  });
  afterAll(async () => { await app?.close(); });

  it("إصدار مذكرة تغطية لطلب مُسنَد ⇒ COV- بشروط العرض · منع التكرار · العميل يراها", async () => {
    const { requestId } = await makeAwardedRequest();

    const cover = (await request(srv()).post("/cover-notes").set(auth(gm)).send({ requestId }).expect(201)).body;
    expect(cover.sequenceNo).toMatch(/^COV-/);
    expect(cover.status).toBe("active");
    expect(Number(cover.totalPremium)).toBe(69000); // من العرض المختار
    expect(new Date(cover.validUntil).getTime()).toBeGreaterThan(Date.now());

    // منع التكرار ⇒ 409
    await request(srv()).post("/cover-notes").set(auth(gm)).send({ requestId }).expect(409);

    // مستند المذكرة (بهوية المستأجر) — يجمع البائع والعميل والشروط
    const doc = (await request(srv()).get(`/cover-notes/${cover.id}/document`).set(auth(gm)).expect(200)).body;
    expect(doc.seller.name).toBeTruthy();
    expect(doc.coverNote.totalPremium).toBe(69000);

    // العميل يراها في بوّابته + مستندها
    const list = (await request(srv()).get("/portal/cover-notes").set(auth(fahd)).expect(200)).body as Array<{ id: string; status: string }>;
    expect(list.some((c) => c.id === cover.id)).toBe(true);
    const pdoc = (await request(srv()).get(`/portal/cover-notes/${cover.id}/document`).set(auth(fahd)).expect(200)).body;
    expect(pdoc.coverNote.sequenceNo).toBe(cover.sequenceNo);
  });

  it("إصدار الوثيقة ⇒ تُستبدَل مذكرة التغطية تلقائيًا (superseded + مرتبطة بالوثيقة)", async () => {
    // عميل جديد — كي لا يُلوّث الإصدار عدّاد وثائق العميل المزروع (بوّابة)
    const { requestId } = await makeAwardedRequest(await freshClient());
    const cover = (await request(srv()).post("/cover-notes").set(auth(gm)).send({ requestId }).expect(201)).body;

    // إصدار الوثيقة من الطلب المُسنَد
    const policy = (await request(srv()).post("/policies/issue").set(auth(gm)).send({ requestId, branchCode: "RUH" }).expect(201)).body;
    const after = (await request(srv()).get(`/cover-notes/${cover.id}`).set(auth(gm)).expect(200)).body;
    expect(after.status).toBe("superseded");
    expect(after.policyId).toBe(policy.id);
  });

  it("حواجز: طلب غير مُسنَد ⇒ 409 · العزل (مستأجر آخر لا يرى) · RBAC (بلا إنتاج) 403", async () => {
    // طلب غير مُسنَد (DRAFT) ⇒ 409
    const draft = await request(srv()).post("/requests").set(auth(gm)).send({
      clientId: "cl-fahd", productLineCode: "GMI",
      base: { insuredName: "الفهد", network: "standard", annualLimit: 500000, ...PERIOD },
      blocks: { members: [{ name: "أ", nationalId: "1234567890", relation: "employee", dob: "1990-01-01", gender: "male" }] },
    });
    await request(srv()).post("/cover-notes").set(auth(gm)).send({ requestId: draft.body.id }).expect(409);

    // عزل: مذكرة الفهد لا تظهر للنخبة (مستأجر آخر)
    const { requestId } = await makeAwardedRequest();
    const cover = (await request(srv()).post("/cover-notes").set(auth(gm)).send({ requestId }).expect(201)).body;
    const amanList = (await request(srv()).get("/portal/cover-notes").set(auth(nukhba)).expect(200)).body as Array<{ id: string }>;
    expect(amanList.some((c) => c.id === cover.id)).toBe(false);
    await request(srv()).get(`/portal/cover-notes/${cover.id}/document`).set(auth(nukhba)).expect(404);

    // RBAC: موظف بلا صلاحية الإنتاج ⇒ 403
    const email = `nonprod-${Date.now()}@gulf-demo.sa`;
    await request(srv()).post("/staff").set(auth(gm)).send({ fullName: "موظف", email, password: "Worker1Pass", roleName: `بلا إنتاج ${Date.now()}`, permissions: [{ module: "clients", canAccess: true, canCreate: false, canEdit: false, canDelete: false }] }).expect(201);
    const staff = (await request(srv()).post("/auth/login").send({ email, password: "Worker1Pass" })).body.accessToken;
    await request(srv()).post("/cover-notes").set(auth(staff)).send({ requestId }).expect(403);
  });
});
