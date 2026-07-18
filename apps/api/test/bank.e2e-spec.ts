/**
 * الحسابات البنكية والتسوية البنكية (§1.6):
 *  - إنشاء حساب + استيراد كشف + مطابقة حركة بسند نظام (RCV) + تجاهل رسوم بنك ⇒ مُسوّى.
 *  - حواجز (سند غير نقدي 400 · تكرار مطابقة 409 · استيراد فارغ 400 · مجهول 404) + عزل + RBAC.
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

const PERIOD = { startDate: "2026-06-01", endDate: "2027-05-31" };

describe("التسوية البنكية (e2e)", () => {
  let app: INestApplication;
  const srv = () => app.getHttpServer();
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  let gm: string; // الخليج (finance)
  let accountant: string; // محاسب الخليج
  let underwriter: string; // بلا finance:create/update كاملة؟ نستخدمه للـRBAC حيث لا finance
  let amanGm: string; // الأمان (عزل)

  const login = async (email: string) => (await request(srv()).post("/auth/login").send({ email, password: "Passw0rd!" })).body.accessToken as string;

  /** ينشئ سند قبض (RCV) عبر دورة الإصدار والتحصيل، ويعيد {voucherId, amount}. */
  async function makeReceiptVoucher(amount: number): Promise<{ voucherId: string; amount: number }> {
    const cr = String(Date.now()).slice(-8) + String(10 + Math.floor(Math.random() * 89));
    const client = await request(srv()).post("/clients").set(auth(gm)).send({ type: "CORPORATE", name: "عميل بنك", crNumber: cr });
    await request(srv()).post(`/clients/${client.body.id}/compliance`).set(auth(gm)).send({ decision: "APPROVED" });
    const req = await request(srv()).post("/requests").set(auth(gm)).send({ clientId: client.body.id, productLineCode: "GMI", base: { insuredName: "ع", network: "standard", annualLimit: 500000, ...PERIOD }, blocks: { members: [{ name: "أ", nationalId: "1234567890", relation: "employee", dob: "1990-01-01", gender: "male" }] } });
    const slip = await request(srv()).post("/slips").set(auth(gm)).send({ requestId: req.body.id });
    const q = await request(srv()).post(`/slips/${slip.body.id}/quotations`).set(auth(gm)).send({ insurerName: "بوبا", premium: 60000, vat: 9000, totalPremium: 69000, deductible: 500, limit: 1000000 });
    await request(srv()).post(`/slips/${slip.body.id}/select`).set(auth(gm)).send({ quotationId: q.body.id }).expect(200);
    const policy = (await request(srv()).post("/policies/issue").set(auth(gm)).send({ requestId: req.body.id, branchCode: "RUH" }).expect(201)).body;
    await request(srv()).post(`/policies/${policy.id}/approve-technical`).set(auth(gm)).expect(200);
    const fin = (await request(srv()).post(`/finance/policies/${policy.id}/approve`).set(auth(accountant)).expect(200)).body;
    const note = (await request(srv()).get("/finance/receivables").set(auth(accountant))).body.notes.find((n: { sequenceNo: string }) => n.sequenceNo === fin.debitNote);
    const rcv = (await request(srv()).post(`/finance/debit-notes/${note.id}/receipt`).set(auth(accountant)).send({ amount, method: "transfer" }).expect(201)).body;
    return { voucherId: rcv.voucher.id, amount: Number(rcv.voucher.amount) };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    gm = await login("waleed@gulf-demo.sa");
    accountant = await login("laila@gulf-demo.sa");
    underwriter = await login("majed@gulf-demo.sa");
    amanGm = await login("omar@aman-demo.sa");
  });
  afterAll(async () => { await app?.close(); });

  it("إنشاء حساب + استيراد + مطابقة RCV + تجاهل رسوم ⇒ مُسوّى", async () => {
    const acc = (await request(srv()).post("/finance/bank/accounts").set(auth(accountant)).send({ name: "الجاري — الراجحي", bankName: "الراجحي", openingBalance: 1000 }).expect(201)).body;
    expect(acc.id).toBeTruthy();

    const { voucherId, amount } = await makeReceiptVoucher(15000);

    // استيراد فارغ ⇒ 400
    await request(srv()).post(`/finance/bank/accounts/${acc.id}/import`).set(auth(accountant)).send({ lines: [] }).expect(400);

    // استيراد سطرين: إيداع = مبلغ السند + رسوم بنك سالبة
    await request(srv()).post(`/finance/bank/accounts/${acc.id}/import`).set(auth(accountant)).send({ lines: [
      { txnDate: "2026-07-01", description: "إيداع تحصيل", amount, reference: "TRX1" },
      { txnDate: "2026-07-02", description: "رسوم بنك", amount: -25 },
    ] }).expect(201);

    // التسوية: رصيد الكشف = 1000 + 15000 − 25 · غير مطابَق 2
    let recon = (await request(srv()).get(`/finance/bank/accounts/${acc.id}/reconciliation`).set(auth(accountant)).expect(200)).body;
    expect(recon.bankBalance).toBeCloseTo(1000 + amount - 25, 2);
    expect(recon.totals.unmatched).toBe(2);
    expect(recon.reconciled).toBe(false);
    // السند مرشّح للمطابقة (RCV إيداع موجب)
    expect(recon.unmatchedVouchers.some((v: { id: string; signedAmount: number }) => v.id === voucherId && Math.abs(v.signedAmount - amount) < 0.01)).toBe(true);

    // مطابقة الإيداع بالسند
    const txns = (await request(srv()).get(`/finance/bank/accounts/${acc.id}/transactions`).set(auth(accountant)).expect(200)).body as Array<{ id: string; amount: number }>;
    const deposit = txns.find((x) => x.amount === amount)!;
    const fee = txns.find((x) => x.amount === -25)!;
    await request(srv()).post(`/finance/bank/transactions/${deposit.id}/match`).set(auth(accountant)).send({ voucherId }).expect(200);

    // تكرار المطابقة على السند نفسه ⇒ 409 (بحركة أخرى) — هنا نعيد على نفس الحركة ⇒ 409 (مطابَقة مسبقًا)
    await request(srv()).post(`/finance/bank/transactions/${deposit.id}/match`).set(auth(accountant)).send({ voucherId }).expect(409);

    // تجاهل رسوم البنك (لا سند لها)
    await request(srv()).put(`/finance/bank/transactions/${fee.id}/status`).set(auth(accountant)).send({ status: "ignored" }).expect(200);

    // الآن مُسوّى (لا حركة غير مطابَقة)
    recon = (await request(srv()).get(`/finance/bank/accounts/${acc.id}/reconciliation`).set(auth(accountant)).expect(200)).body;
    expect(recon.totals.unmatched).toBe(0);
    expect(recon.totals.matched).toBe(1);
    expect(recon.totals.ignored).toBe(1);
    expect(recon.reconciled).toBe(true);
  });

  it("حواجز: سند غير نقدي (JRV) ⇒ 400 · حساب مجهول 404 · العزل + RBAC", async () => {
    const acc = (await request(srv()).post("/finance/bank/accounts").set(auth(accountant)).send({ name: "حساب2" }).expect(201)).body;
    await request(srv()).post(`/finance/bank/accounts/${acc.id}/import`).set(auth(accountant)).send({ lines: [{ txnDate: "2026-07-01", description: "x", amount: 500 }] }).expect(201);
    const txn = (await request(srv()).get(`/finance/bank/accounts/${acc.id}/transactions`).set(auth(accountant))).body[0];

    // إنشاء قيد يومية (JRV) عبر journal ثم محاولة مطابقته ⇒ 400 (يُطابَق بقبض/صرف فقط)
    const jv = (await request(srv()).post("/finance/journal").set(auth(accountant)).send({ description: "قيد", entries: [{ account: "05030000000000000", debit: 500 }, { account: "01010000000000000", credit: 500 }] }).expect(201)).body;
    await request(srv()).post(`/finance/bank/transactions/${txn.id}/match`).set(auth(accountant)).send({ voucherId: jv.id }).expect(400);

    // حساب مجهول ⇒ 404
    await request(srv()).get("/finance/bank/accounts/nonexistent/reconciliation").set(auth(accountant)).expect(404);

    // العزل: الأمان لا يرى حساب الخليج (404 على تسويته)
    await request(srv()).get(`/finance/bank/accounts/${acc.id}/reconciliation`).set(auth(amanGm)).expect(404);

    // RBAC: المكتتب (لا finance) ⇒ 403
    await request(srv()).get("/finance/bank/accounts").set(auth(underwriter)).expect(403);
    await request(srv()).post("/finance/bank/accounts").set(auth(underwriter)).send({ name: "x" }).expect(403);
  });
});
