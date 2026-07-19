/**
 * محرّر RBAC (إدارة الأدوار والصلاحيات) — تحقّق:
 *  - سرد الأدوار (مُعدّة + مخصّصة) بمصفوفة الصلاحيات وعدد المستخدمين.
 *  - إنشاء دور مخصّص + تعديل مصفوفته + حذفه (غير مُستخدَم).
 *  - حواجز: حذف مُعدّ مسبقًا ⇒ 409 · حذف مُسنَد لمستخدم ⇒ 409 · القفل الذاتي عن الإعدادات ⇒ 400.
 *  - إسناد دور لمستخدم. الأمن: مستخدم بلا صلاحية settings ⇒ 403.
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { RBAC_MODULES } from "../src/modules/rbac/rbac.constants";

const perm = (module: string, code = "") => ({
  module,
  canAccess: code.includes("A"), canCreate: code.includes("C"), canEdit: code.includes("E"), canDelete: code.includes("D"), canRevert: code.includes("R"),
});
// مصفوفة كاملة: كل الموديولز صفر إلا ما يُمرَّر
const matrix = (over: Record<string, string> = {}) => RBAC_MODULES.map((m) => perm(m, over[m] ?? ""));

describe("محرّر RBAC — الأدوار والصلاحيات (e2e)", () => {
  let app: INestApplication;
  let gm: string; // مدير عام الخليج — settings ACED
  const srv = () => app.getHttpServer();
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const uniq = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    gm = (await request(srv()).post("/auth/login").send({ email: "waleed@gulf-demo.sa", password: "Passw0rd!" })).body.accessToken;
  });
  afterAll(async () => { await app?.close(); });

  it("سرد الأدوار: المُعدّة مسبقًا موجودة بمصفوفتها وعدد مستخدميها", async () => {
    const roles = (await request(srv()).get("/roles").set(auth(gm)).expect(200)).body as Array<{ name: string; isPreset: boolean; permissions: unknown[]; userCount: number }>;
    expect(roles.length).toBeGreaterThanOrEqual(12); // 12 دورًا مُعدًّا مسبقًا على الأقل
    const gmRole = roles.find((r) => r.isPreset && r.name.includes("المدير العام"));
    expect(gmRole).toBeTruthy();
    expect(Array.isArray(gmRole!.permissions)).toBe(true);
    expect(typeof gmRole!.userCount).toBe("number");
  });

  it("إنشاء دور مخصّص + تعديل مصفوفته", async () => {
    const name = `دور اختبار ${uniq()}`;
    const created = (await request(srv()).post("/roles").set(auth(gm)).send({ name, permissions: matrix({ clients: "A", sales: "AC" }) }).expect(201)).body as { id: string; isPreset: boolean };
    expect(created.isPreset).toBe(false);
    // تعديل: أضِف صلاحية المالية
    await request(srv()).put(`/roles/${created.id}`).set(auth(gm)).send({ permissions: matrix({ clients: "AE", finance: "ACED" }) }).expect(200);
    const roles = (await request(srv()).get("/roles").set(auth(gm)).expect(200)).body as Array<{ id: string; permissions: Array<{ module: string; canDelete: boolean }> }>;
    const fin = roles.find((r) => r.id === created.id)!.permissions.find((p) => p.module === "finance");
    expect(fin?.canDelete).toBe(true);
  });

  it("اسم دور مكرّر ⇒ 409", async () => {
    const name = `مكرّر ${uniq()}`;
    await request(srv()).post("/roles").set(auth(gm)).send({ name, permissions: matrix({ dashboard: "A" }) }).expect(201);
    await request(srv()).post("/roles").set(auth(gm)).send({ name, permissions: matrix({ dashboard: "A" }) }).expect(409);
  });

  it("حذف دور مخصّص غير مُستخدَم ⇒ 200؛ ومُعدّ مسبقًا ⇒ 409", async () => {
    const created = (await request(srv()).post("/roles").set(auth(gm)).send({ name: `للحذف ${uniq()}`, permissions: matrix({ dashboard: "A" }) }).expect(201)).body as { id: string };
    await request(srv()).delete(`/roles/${created.id}`).set(auth(gm)).expect(200);
    // مُعدّ مسبقًا لا يُحذَف
    const roles = (await request(srv()).get("/roles").set(auth(gm))).body as Array<{ id: string; isPreset: boolean }>;
    const preset = roles.find((r) => r.isPreset)!;
    await request(srv()).delete(`/roles/${preset.id}`).set(auth(gm)).expect(409);
  });

  it("القفل الذاتي: المدير لا يُزيل صلاحية الإعدادات عن دوره ⇒ 400", async () => {
    const roles = (await request(srv()).get("/roles").set(auth(gm))).body as Array<{ id: string; name: string; isPreset: boolean }>;
    const gmRole = roles.find((r) => r.name.includes("المدير العام"))!;
    // مصفوفة بلا settings ⇒ يجب أن تُرفَض (لأن دور المستخدم الحالي)
    await request(srv()).put(`/roles/${gmRole.id}`).set(auth(gm)).send({ permissions: matrix({ dashboard: "A" }) }).expect(400);
  });

  it("إسناد دور لمستخدم + منع حذف دور مُسنَد ⇒ 409", async () => {
    // أنشئ دورًا + موظفًا عليه
    const role = (await request(srv()).post("/roles").set(auth(gm)).send({ name: `مُسنَد ${uniq()}`, permissions: matrix({ dashboard: "A", clients: "A" }) }).expect(201)).body as { id: string };
    const email = `assignee-${uniq()}@gulf-demo.sa`;
    await request(srv()).post("/staff").set(auth(gm)).send({ fullName: "موظف إسناد", email, password: "Passw0rd1", roleName: `تمهيد ${uniq()}`, permissions: matrix({ dashboard: "A" }) }).expect(201);
    const staff = (await request(srv()).get("/staff").set(auth(gm))).body as Array<{ id: string; email: string }>;
    const u = staff.find((x) => x.email === email)!;
    await request(srv()).post(`/staff/${u.id}/role`).set(auth(gm)).send({ roleId: role.id }).expect(200);
    // الدور صار مُسندًا ⇒ لا يُحذَف
    await request(srv()).delete(`/roles/${role.id}`).set(auth(gm)).expect(409);
  });

  it("الأمن: مستخدم بلا صلاحية settings ⇒ 403 على إدارة الأدوار", async () => {
    const email = `nosettings-${uniq()}@gulf-demo.sa`;
    // موظف بلا أي صلاحية إعدادات
    await request(srv()).post("/staff").set(auth(gm)).send({ fullName: "بلا إعدادات", email, password: "Passw0rd1", roleName: `تشغيلي ${uniq()}`, permissions: matrix({ dashboard: "A", clients: "AC" }) }).expect(201);
    const tok = (await request(srv()).post("/auth/login").send({ email, password: "Passw0rd1" })).body.accessToken;
    await request(srv()).get("/roles").set(auth(tok)).expect(403);
    await request(srv()).post("/roles").set(auth(tok)).send({ name: "x", permissions: matrix({ dashboard: "A" }) }).expect(403);
  });
});
