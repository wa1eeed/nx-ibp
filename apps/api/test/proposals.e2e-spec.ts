/**
 * عرض العروض على العميل + قبوله/رفضه عبر البوّابة (§4.1):
 *  - الوسيط يعرض عروضًا منتقاة ⇒ العميل يراها في بوّابته **بلا بيانات عمولة الوسيط** (خصوصية).
 *  - القبول ⇒ أمر إسناد (الطلب AWARDED) + إشعار الوسيط · الرفض ⇒ توثيق + إشعار.
 *  - العزل (عميل آخر لا يرى/يقبل) + منع القرار المكرّر + RBAC العرض.
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

const PERIOD = { startDate: "2026-06-01", endDate: "2027-05-31" };

describe("عروض التأمين للعميل (e2e)", () => {
  let app: INestApplication;
  const srv = () => app.getHttpServer();
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  let gm: string; // الخليج (production)
  let fahd: string; // بوّابة الفهد (cl-fahd)
  let nukhba: string; // بوّابة النخبة (مستأجر آخر — عزل)

  const login = async (email: string) => (await request(srv()).post("/auth/login").send({ email, password: "Passw0rd!" })).body.accessToken as string;
  const pLogin = async (email: string) => (await request(srv()).post("/portal/login").send({ email, password: "Passw0rd!" })).body.accessToken as string;

  /** ينشئ طلبًا لعميل + طلب أسعار + عرضين، ويعيد المعرّفات. */
  async function makeProposalSlip(): Promise<{ slipId: string; quotationIds: string[] }> {
    const req = await request(srv()).post("/requests").set(auth(gm)).send({
      clientId: "cl-fahd", productLineCode: "GMI",
      base: { insuredName: "الفهد", network: "standard", annualLimit: 500000, ...PERIOD },
      blocks: { members: [{ name: "أ", nationalId: "1234567890", relation: "employee", dob: "1990-01-01", gender: "male" }] },
    });
    const slip = await request(srv()).post("/slips").set(auth(gm)).send({ requestId: req.body.id });
    const q1 = await request(srv()).post(`/slips/${slip.body.id}/quotations`).set(auth(gm)).send({ insurerName: "بوبا", premium: 60000, vat: 9000, totalPremium: 69000, commissionRate: 12.5, commissionAmount: 7500, commissionVat: 1125, deductible: 500, limit: 1000000 });
    const q2 = await request(srv()).post(`/slips/${slip.body.id}/quotations`).set(auth(gm)).send({ insurerName: "التعاونية", premium: 55000, vat: 8250, totalPremium: 63250, commissionRate: 10, commissionAmount: 5500, commissionVat: 825, deductible: 750, limit: 900000 });
    return { slipId: slip.body.id, quotationIds: [q1.body.id, q2.body.id] };
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

  it("عرض ⇒ العميل يراه بلا عمولة ⇒ قبول ⇒ أمر إسناد (AWARDED)", async () => {
    const { slipId, quotationIds } = await makeProposalSlip();

    // قبل العرض: لا يظهر للعميل
    const before = (await request(srv()).get("/portal/proposals").set(auth(fahd)).expect(200)).body as Array<{ id: string }>;
    expect(before.some((p) => p.id === slipId)).toBe(false);

    // الوسيط يعرض العرضين
    const presented = (await request(srv()).post(`/slips/${slipId}/present`).set(auth(gm)).send({ quotationIds }).expect(200)).body;
    expect(presented.clientDecision).toBe("pending");
    expect(presented.presentedQuotationIds).toHaveLength(2);

    // العميل يراه الآن (pending)
    const list = (await request(srv()).get("/portal/proposals").set(auth(fahd)).expect(200)).body as Array<{ id: string; decision: string; options: number }>;
    const mine = list.find((p) => p.id === slipId);
    expect(mine).toBeTruthy();
    expect(mine!.decision).toBe("pending");
    expect(mine!.options).toBe(2);

    // التفاصيل: خيارات بلا أي بيانات عمولة الوسيط (خصوصية)
    const detail = (await request(srv()).get(`/portal/proposals/${slipId}`).set(auth(fahd)).expect(200)).body;
    expect(detail.quotations).toHaveLength(2);
    for (const q of detail.quotations) {
      expect(q).toHaveProperty("totalPremium");
      expect(q).not.toHaveProperty("commissionAmount");
      expect(q).not.toHaveProperty("commissionRate");
      expect(q).not.toHaveProperty("commissionVat");
    }

    // القبول ⇒ أمر إسناد
    const accepted = (await request(srv()).post(`/portal/proposals/${slipId}/accept`).set(auth(fahd)).send({ quotationId: quotationIds[1] }).expect(200)).body;
    expect(accepted.decision).toBe("accepted");
    expect(accepted.requestStatus).toBe("AWARDED");

    // طلب الأسعار صار SELECTED بالعرض المقبول (تحقّق من جانب الوسيط)
    const slip = (await request(srv()).get(`/slips/${slipId}`).set(auth(gm)).expect(200)).body;
    expect(slip.status).toBe("SELECTED");
    expect(slip.selectedQuotationId).toBe(quotationIds[1]);
    expect(slip.clientDecision).toBe("accepted");

    // منع القرار المكرّر
    await request(srv()).post(`/portal/proposals/${slipId}/accept`).set(auth(fahd)).send({ quotationId: quotationIds[0] }).expect(409);
  });

  it("الرفض: يُوثَّق ويُشعر الوسيط، ولا يُسنِد الطلب", async () => {
    const { slipId, quotationIds } = await makeProposalSlip();
    await request(srv()).post(`/slips/${slipId}/present`).set(auth(gm)).send({ quotationIds }).expect(200);
    const declined = (await request(srv()).post(`/portal/proposals/${slipId}/decline`).set(auth(fahd)).send({ note: "الأسعار مرتفعة" }).expect(200)).body;
    expect(declined.decision).toBe("declined");
    // الطلب لم يُسنَد (يبقى طلب الأسعار غير SELECTED)
    const slip = (await request(srv()).get(`/slips/${slipId}`).set(auth(gm)).expect(200)).body;
    expect(slip.status).not.toBe("SELECTED");
    expect(slip.clientDecision).toBe("declined");
    expect(slip.clientDecisionNote).toBe("الأسعار مرتفعة");
  });

  it("العزل: عميل مستأجر آخر لا يرى/يقبل عرض الفهد (404)", async () => {
    const { slipId, quotationIds } = await makeProposalSlip();
    await request(srv()).post(`/slips/${slipId}/present`).set(auth(gm)).send({ quotationIds }).expect(200);
    // النخبة (مستأجر آخر) لا يراه في قائمته
    const list = (await request(srv()).get("/portal/proposals").set(auth(nukhba)).expect(200)).body as Array<{ id: string }>;
    expect(list.some((p) => p.id === slipId)).toBe(false);
    // ولا يستطيع فتحه أو قبوله
    await request(srv()).get(`/portal/proposals/${slipId}`).set(auth(nukhba)).expect(404);
    await request(srv()).post(`/portal/proposals/${slipId}/accept`).set(auth(nukhba)).send({ quotationId: quotationIds[0] }).expect(404);
  });

  it("حواجز العرض: عرض بلا عروض مُختارة 400 · طلب أسعار مجهول 404 · RBAC (بلا اكتتاب) 403", async () => {
    const { slipId } = await makeProposalSlip();
    await request(srv()).post(`/slips/${slipId}/present`).set(auth(gm)).send({ quotationIds: [] }).expect(400);
    await request(srv()).post(`/slips/nonexistent/present`).set(auth(gm)).send({ quotationIds: ["x"] }).expect(404);
    // موظف بلا صلاحية الاكتتاب/الإنتاج
    const email = `nonuw-${Date.now()}@gulf-demo.sa`;
    await request(srv()).post("/staff").set(auth(gm)).send({ fullName: "موظف", email, password: "Worker1Pass", roleName: `بلا اكتتاب ${Date.now()}`, permissions: [{ module: "clients", canAccess: true, canCreate: false, canEdit: false, canDelete: false }] }).expect(201);
    const staff = (await request(srv()).post("/auth/login").send({ email, password: "Worker1Pass" })).body.accessToken;
    await request(srv()).post(`/slips/${slipId}/present`).set(auth(staff)).send({ quotationIds: ["x"] }).expect(403);
  });
});
