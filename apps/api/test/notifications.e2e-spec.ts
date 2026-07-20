/**
 * اختبار نظام الإشعارات (H):
 *  - قائمة الأنواع (Email/SMS + نص) على مستويين: افتراضي المنصة وتخصيص الشركة.
 *  - تخصيص الشركة يتجاوز افتراضي المنصة؛ وافتراضي المنصة يُورَّث للحسابات بلا تخصيص.
 *  - العزل بين الشركات. نوع مجهول ⇒ 400. الصلاحية مطلوبة.
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

describe("نظام الإشعارات (e2e)", () => {
  let app: INestApplication;
  let platform: string;
  const srv = () => app.getHttpServer();
  const uniq = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const owner = async () => (await request(srv()).post("/signup").send({ companyName: `إشعار ${uniq()}`, adminName: "مالك", adminEmail: `nt-${uniq()}@brk.sa`, password: "Owner1Pass", seatCount: 25 }).expect(201)).body.accessToken;
  const find = (list: { eventKey: string }[], k: string) => list.find((x) => x.eventKey === k) as any;
  // فكّ ترميز JWT (بلا تحقّق) للحصول على roleId لمالك الحساب
  const decode = (tok: string) => JSON.parse(Buffer.from(tok.split(".")[1], "base64").toString("utf8"));
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  // يضيف موظفًا بلا صلاحية «settings» (فلا يصير مستقبِلًا لإشعار إضافة مستخدم) — يُطلق staff_member_added
  const addMember = (t: string, fullName: string) =>
    request(srv()).post("/staff").set(auth(t)).send({
      fullName, email: `m-${uniq()}@brk.sa`, password: "Member1Pass", roleName: `دور ${uniq()}`,
      permissions: [{ module: "sales", canAccess: false, canCreate: false, canEdit: false, canDelete: false }],
    });
  // يستطلع صندوق الموظف حتى يتحقّق الشرط (لإشعارات fire-and-forget)
  const waitInbox = async (t: string, pred: (ib: any[]) => boolean, tries = 25): Promise<any[]> => {
    let ib: any[] = [];
    for (let i = 0; i < tries; i++) {
      ib = (await request(srv()).get("/notifications/inbox").set(auth(t))).body;
      if (pred(ib)) return ib;
      await sleep(100);
    }
    return ib;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    platform = (await request(srv()).post("/platform/login").send({ email: "admin@ibp-platform.sa", password: "Passw0rd!" })).body.accessToken;
  });
  afterAll(async () => { await app?.close(); });

  it("الشركة: قائمة كل الأنواع (عملاء + موظفين) بقنواتها ونصوصها", async () => {
    const t = await owner();
    const list = (await request(srv()).get("/notifications").set(auth(t)).expect(200)).body;
    expect(list.length).toBe(35); // 14 عملاء + 21 موظفين (+ شكوى + AML + عرض/قبول/رفض + مذكرة تغطية + قسط قادم)
    expect(find(list, "policy_issued").channelEmail).toBe(true);
    expect(find(list, "policy_issued").audience).toBe("client");
    expect(find(list, "tax_invoice").source).toBe("default"); // نوع لا يُخصَّص في هذا الملف ⇒ افتراضي النظام
    // إشعارات الموظفين حاضرة بجمهورها
    expect(find(list, "staff_claim_created").audience).toBe("staff");
    expect(find(list, "staff_policy_finance_review").audience).toBe("staff");
  });

  it("الشركة: تخصيص نوع (تعطيل SMS + تعديل النص)", async () => {
    const t = await owner();
    await request(srv()).put("/notifications/policy_issued").set(auth(t)).send({ channelEmail: true, channelSms: false, body: "تم إصدار وثيقتك {sequenceNo} — نص مخصّص" }).expect(200);
    const list = (await request(srv()).get("/notifications").set(auth(t)).expect(200)).body;
    const p = find(list, "policy_issued");
    expect(p.source).toBe("custom");
    expect(p.channelSms).toBe(false);
    expect(p.body).toContain("نص مخصّص");
  });

  it("افتراضي المنصة يُورَّث للحسابات بلا تخصيص", async () => {
    await request(srv()).put("/platform/notifications/welcome").set(auth(platform)).send({ channelEmail: true, channelSms: true, body: "ترحيب المنصة الموحّد" }).expect(200);
    const t = await owner(); // حساب جديد بلا تخصيص welcome
    const list = (await request(srv()).get("/notifications").set(auth(t)).expect(200)).body;
    const w = find(list, "welcome");
    expect(w.source).toBe("inherited");
    expect(w.body).toBe("ترحيب المنصة الموحّد");
  });

  it("عزل: تخصيص شركة لا يظهر لأخرى", async () => {
    const a = await owner();
    await request(srv()).put("/notifications/claim_ack").set(auth(a)).send({ channelEmail: false, channelSms: false, body: "سرّي" }).expect(200);
    const b = await owner();
    const list = (await request(srv()).get("/notifications").set(auth(b)).expect(200)).body;
    expect(find(list, "claim_ack").body).not.toBe("سرّي");
  });

  it("نوع مجهول ⇒ 400", async () => {
    const t = await owner();
    await request(srv()).put("/notifications/nope").set(auth(t)).send({ channelEmail: true, channelSms: false, body: "x" }).expect(400);
  });

  it("بلا مصادقة ⇒ 401", () => request(srv()).get("/notifications").expect(401));

  // ————————————————— §9.1 تفضيلات الإشعارات لكل دور —————————————————

  it("§9.1: مصفوفة الأدوار × أنواع إشعارات الموظفين (لا مكتوم ابتداءً)", async () => {
    const t = await owner();
    const m = (await request(srv()).get("/notifications/preferences").set(auth(t)).expect(200)).body;
    expect(m.roles.length).toBeGreaterThanOrEqual(6); // الأدوار المُهيّأة عند الإنشاء
    expect(m.types.length).toBe(21); // أنواع إشعارات الموظفين فقط
    expect(m.types.every((x: any) => x.key.startsWith("staff_"))).toBe(true);
    expect(m.types.find((x: any) => x.key === "staff_claim_created").module).toBe("claims");
    expect(m.muted).toEqual([]); // opt-out: لا صفوف مكتومة ابتداءً
  });

  it("§9.1: كتم نوع لدور ثم إعادة تفعيله", async () => {
    const t = await owner();
    const roleId = decode(t).roleId as string;
    await request(srv()).put("/notifications/preferences").set(auth(t)).send({ roleId, eventKey: "staff_claim_created", enabled: false }).expect(200);
    let m = (await request(srv()).get("/notifications/preferences").set(auth(t)).expect(200)).body;
    expect(m.muted).toContainEqual({ roleId, eventKey: "staff_claim_created" });
    // إعادة التفعيل تُزيله من المكتوم
    await request(srv()).put("/notifications/preferences").set(auth(t)).send({ roleId, eventKey: "staff_claim_created", enabled: true }).expect(200);
    m = (await request(srv()).get("/notifications/preferences").set(auth(t)).expect(200)).body;
    expect(m.muted).not.toContainEqual({ roleId, eventKey: "staff_claim_created" });
  });

  it("§9.1: التوجيه يحترم الكتم — دور مكتوم لا يستلم، ودور غير مكتوم يستلم", async () => {
    // شركة مكتومة: نكتم staff_member_added لدور المالك ولا نُلغي الكتم إطلاقًا (تفاديًا لسباق الإرسال اللامتزامن)
    const tm = await owner();
    const roleM = decode(tm).roleId as string;
    await request(srv()).put("/notifications/preferences").set(auth(tm)).send({ roleId: roleM, eventKey: "staff_member_added", enabled: false }).expect(200);
    await addMember(tm, `محجوب-${uniq()}`).expect(201);
    // شركة مرجعية (بلا كتم) — أُضيفت بعد المكتومة، فوصولها يعني أن اللامتزامن للمكتومة أُتيح له وقت أطول
    const tc = await owner();
    await addMember(tc, `مسموح-${uniq()}`).expect(201);
    const inboxC = await waitInbox(tc, (ib) => ib.some((n) => n.eventKey === "staff_member_added"));
    expect(inboxC.some((n) => n.eventKey === "staff_member_added" && n.body.includes("مسموح"))).toBe(true); // غير المكتوم وصل
    // بعد وصول المرجعية، صندوق المالك المكتوم لا يحوي النوع المكتوم إطلاقًا
    const inboxM = (await request(srv()).get("/notifications/inbox").set(auth(tm))).body;
    expect(inboxM.some((n: any) => n.eventKey === "staff_member_added")).toBe(false);
  });

  it("§9.1: نوع عميل أو نوع مجهول أو دور مجهول ⇒ 400", async () => {
    const t = await owner();
    const roleId = decode(t).roleId as string;
    await request(srv()).put("/notifications/preferences").set(auth(t)).send({ roleId, eventKey: "welcome", enabled: false }).expect(400); // نوع عميل ليس موظفين
    await request(srv()).put("/notifications/preferences").set(auth(t)).send({ roleId, eventKey: "nope", enabled: false }).expect(400); // نوع مجهول
    await request(srv()).put("/notifications/preferences").set(auth(t)).send({ roleId: "role-does-not-exist", eventKey: "staff_claim_created", enabled: false }).expect(400); // دور مجهول
  });

  it("§9.1: عزل — كتم شركة لا يظهر في مصفوفة أخرى", async () => {
    const a = await owner();
    const roleA = decode(a).roleId as string;
    await request(srv()).put("/notifications/preferences").set(auth(a)).send({ roleId: roleA, eventKey: "staff_renewal_due", enabled: false }).expect(200);
    const b = await owner();
    const mb = (await request(srv()).get("/notifications/preferences").set(auth(b)).expect(200)).body;
    expect(mb.muted).toEqual([]); // لا تسرّب لأدوار/كتم شركة أخرى
    expect(mb.roles.every((r: any) => r.id !== roleA)).toBe(true);
  });
});
