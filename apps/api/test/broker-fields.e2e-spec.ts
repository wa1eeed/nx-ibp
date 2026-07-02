/**
 * اختبار إثراء حقول المؤمن له (المعايير القياسية لوساطة التأمين):
 *  - إنشاء عميل بكامل الحقول المعيارية ⇒ تُحفظ وتُرجَع.
 *  - قيم غير صالحة للحقول المقيّدة ⇒ 400. (حقول الوثيقة تُغطّى في finance.e2e.)
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

describe("إثراء حقول العميل (e2e)", () => {
  let app: INestApplication;
  const srv = () => app.getHttpServer();
  const uniq = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function newOwner(): Promise<string> {
    const res = await request(srv()).post("/signup").send({ companyName: `حقول ${uniq()}`, adminName: "مالك", adminEmail: `bf-${uniq()}@brk.sa`, password: "Owner1Pass" }).expect(201);
    return res.body.accessToken;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  afterAll(async () => { await app?.close(); });

  const fullClient = {
    type: "CORPORATE", name: "منشأة الاختبار للتجارة", crNumber: `10${uniq().replace(/\D/g, "").slice(0, 8)}`,
    vatNumber: "300000000000003", relationStatus: "non_captive", legalForm: "llc", source: "producer",
    producerName: "وسيط الرياض", businessActivity: "تجارة تجزئة", iban: "SA0000000000000000000000",
    nationalAddress: "الرياض 12345", city: "الرياض", email: "info@test-corp.sa", phone: "0500000000",
    contacts: [{ name: "أحمد المالك", title: "المدير المالي", phone: "0511111111", email: "cfo@test-corp.sa" }],
  };

  it("إنشاء عميل بكامل الحقول المعيارية ⇒ تُحفظ وتُرجَع", async () => {
    const token = await newOwner();
    const created = (await request(srv()).post("/clients").set(auth(token)).send(fullClient).expect(201)).body;
    const c = (await request(srv()).get(`/clients/${created.id}`).set(auth(token)).expect(200)).body;
    expect(c.vatNumber).toBe("300000000000003");
    expect(c.relationStatus).toBe("non_captive");
    expect(c.legalForm).toBe("llc");
    expect(c.source).toBe("producer");
    expect(c.producerName).toBe("وسيط الرياض");
    expect(c.businessActivity).toBe("تجارة تجزئة");
    expect(c.iban).toBe("SA0000000000000000000000");
    expect(Array.isArray(c.contacts)).toBe(true);
    expect(c.contacts[0].title).toBe("المدير المالي");
  });

  it("قيمة غير مسموحة لحقل مقيّد (relationStatus) ⇒ 400", async () => {
    const token = await newOwner();
    await request(srv()).post("/clients").set(auth(token)).send({ ...fullClient, crNumber: undefined, relationStatus: "خطأ" }).expect(400);
  });

  it("شكل قانوني غير معروف ⇒ 400", async () => {
    const token = await newOwner();
    await request(srv()).post("/clients").set(auth(token)).send({ type: "CORPORATE", name: "منشأة", legalForm: "unknown" }).expect(400);
  });
});
