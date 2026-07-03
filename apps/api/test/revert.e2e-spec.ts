/**
 * اختبار E4 — التراجع خطوة للوراء:
 *  - كيان آلة حالة (مطالبة) يُرجَع خطوة لسابقتها بصلاحية canRevert (المدير العام).
 *  - الحالة الأولى ⇒ لا تراجع (409). بلا صلاحية canRevert ⇒ 403.
 *  - **حاجز امتثالي:** وثيقة مُصدَرة (ISSUED) لا تُرجَع مباشرة (تتطلّب إجراءً تعويضيًا) ⇒ 409.
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

describe("التراجع خطوة للوراء — E4 (e2e)", () => {
  let app: INestApplication;
  let gm: string; // مدير عام (له canRevert)
  let noRevert = ""; // موظف بصلاحيات مطالبات لكن بلا canRevert

  const login = async (email: string, password = "Passw0rd!") =>
    (await request(app.getHttpServer()).post("/auth/login").send({ email, password })).body.accessToken as string;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    gm = await login("waleed@gulf-demo.sa");
    const uniq = String(Date.now()).slice(-8);
    const nEmail = `norevert-${uniq}@gulf-demo.sa`;
    await request(app.getHttpServer()).post("/staff").set(auth(gm)).send({
      fullName: "بلا تراجع", email: nEmail, password: "Passw0rd1", roleName: `عامل-${uniq}`,
      permissions: [{ module: "claims", canAccess: true, canCreate: true, canEdit: true, canDelete: false, canRevert: false }],
    }).expect(201);
    noRevert = await login(nEmail, "Passw0rd1");
  });

  afterAll(async () => { await app?.close(); });

  it("مطالبة: تراجع خطوة للوراء (UNDER_REVIEW ⇒ RECEIVED) ثم لا تراجع من الحالة الأولى", async () => {
    const claim = (await request(app.getHttpServer()).post("/claims").set(auth(gm)).send({ insurerName: "التعاونية", claimedAmount: 12000 }).expect(201)).body;
    // نقل الحالة للأمام ثم التراجع
    await request(app.getHttpServer()).post(`/claims/${claim.id}/status`).set(auth(gm)).send({ status: "UNDER_REVIEW" }).expect(200);
    const rev = (await request(app.getHttpServer()).post(`/revert/claim/${claim.id}`).set(auth(gm)).expect(200)).body;
    expect(rev.from).toBe("UNDER_REVIEW");
    expect(rev.to).toBe("RECEIVED");
    // الآن في الحالة الأولى ⇒ لا خطوة سابقة
    await request(app.getHttpServer()).post(`/revert/claim/${claim.id}`).set(auth(gm)).expect(409);
  });

  it("بلا صلاحية canRevert ⇒ 403", async () => {
    const claim = (await request(app.getHttpServer()).post("/claims").set(auth(gm)).send({ insurerName: "بوبا", claimedAmount: 5000 }).expect(201)).body;
    await request(app.getHttpServer()).post(`/claims/${claim.id}/status`).set(auth(gm)).send({ status: "UNDER_REVIEW" }).expect(200);
    await request(app.getHttpServer()).post(`/revert/claim/${claim.id}`).set(auth(noRevert)).expect(403);
  });

  it("حاجز امتثالي: وثيقة مُصدَرة (ISSUED) لا تُرجَع مباشرة ⇒ 409", async () => {
    // rp-naseej-med وثيقة مُصدَرة مبذورة (نفس مستأجر المدير العام) — محاولة تراجع للقراءة فقط
    await request(app.getHttpServer()).post(`/revert/policy/rp-naseej-med`).set(auth(gm)).expect(409);
  });

  it("نوع كيان غير مدعوم ⇒ 400", () =>
    request(app.getHttpServer()).post(`/revert/nope/x`).set(auth(gm)).expect(400));
});
