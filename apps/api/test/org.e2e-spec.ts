/**
 * اختبار الهيكل الإداري والأقسام (C1):
 *  - إنشاء أقسام هرمية + شجرة. القسم يحمل دورًا افتراضيًا.
 *  - إسناد موظف لقسم ⇒ يرث الدور الافتراضي (ما لم يُمرَّر دور صريح).
 *  - منع الدورات في الهيكل. العزل بين المستأجرين. حذف يفصل الأعضاء.
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

describe("الهيكل الإداري (e2e)", () => {
  let app: INestApplication;
  const srv = () => app.getHttpServer();
  const uniq = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  // مالك جديد (له صلاحية settings كاملة) + دوره الافتراضي (دور المالك)
  async function newOwner(): Promise<{ token: string; roleId: string }> {
    const res = await request(srv()).post("/signup").send({ companyName: `هيكل ${uniq()}`, adminName: "مالك", adminEmail: `org-${uniq()}@brk.sa`, password: "Owner1Pass" }).expect(201);
    return { token: res.body.accessToken, roleId: res.body.user.roleId };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  afterAll(async () => { await app?.close(); });

  it("ينشئ أقسامًا هرمية ويعيد شجرة", async () => {
    const { token } = await newOwner();
    const parent = await request(srv()).post("/org/departments").set(auth(token)).send({ name: "الإدارة العامة" }).expect(201);
    await request(srv()).post("/org/departments").set(auth(token)).send({ name: "قسم المبيعات", parentId: parent.body.id }).expect(201);
    const tree = await request(srv()).get("/org/departments").set(auth(token)).expect(200);
    expect(tree.body.length).toBe(1); // جذر واحد
    expect(tree.body[0].name).toBe("الإدارة العامة");
    expect(tree.body[0].children.length).toBe(1);
    expect(tree.body[0].children[0].name).toBe("قسم المبيعات");
  });

  it("إسناد موظف لقسم بدور افتراضي ⇒ يرث الدور", async () => {
    const { token, roleId } = await newOwner();
    // قسم بدور افتراضي = دور المالك
    const dep = await request(srv()).post("/org/departments").set(auth(token)).send({ name: "قسم بدور", defaultRoleId: roleId }).expect(201);
    // أنشئ موظفًا بلا اعتماد على دوره، ثم أسنده للقسم
    const staff = await request(srv()).post("/staff").set(auth(token)).send({ fullName: "موظف القسم", email: `m-${uniq()}@brk.sa`, password: "Worker1Pass", roleName: "مؤقت", permissions: [{ module: "clients", canAccess: true, canCreate: false, canEdit: false, canDelete: false }] }).expect(201);
    const assigned = await request(srv()).post("/org/departments/assign").set(auth(token)).send({ userId: staff.body.id, departmentId: dep.body.id }).expect(201);
    expect(assigned.body.departmentId).toBe(dep.body.id);
    expect(assigned.body.roleId).toBe(roleId); // ورث الدور الافتراضي للقسم
  });

  it("يمنع الدورات في الهيكل (نقل الأب تحت ابنه ⇒ 400)", async () => {
    const { token } = await newOwner();
    const a = await request(srv()).post("/org/departments").set(auth(token)).send({ name: "القسم أ" }).expect(201);
    const b = await request(srv()).post("/org/departments").set(auth(token)).send({ name: "القسم ب", parentId: a.body.id }).expect(201);
    await request(srv()).patch(`/org/departments/${a.body.id}`).set(auth(token)).send({ parentId: b.body.id }).expect(400);
  });

  it("عزل: لا يرى/يعدّل مستأجر أقسام غيره (404)", async () => {
    const a = await newOwner();
    const dep = await request(srv()).post("/org/departments").set(auth(a.token)).send({ name: "سرّي" }).expect(201);
    const b = await newOwner();
    const tree = await request(srv()).get("/org/departments").set(auth(b.token)).expect(200);
    expect(tree.body.find((d: { id: string }) => d.id === dep.body.id)).toBeUndefined();
    await request(srv()).patch(`/org/departments/${dep.body.id}`).set(auth(b.token)).send({ name: "اختراق" }).expect(404);
  });

  it("الحذف يفصل الأعضاء (departmentId ⇐ null)", async () => {
    const { token, roleId } = await newOwner();
    const dep = await request(srv()).post("/org/departments").set(auth(token)).send({ name: "للحذف", defaultRoleId: roleId }).expect(201);
    const staff = await request(srv()).post("/staff").set(auth(token)).send({ fullName: "عضو", email: `d-${uniq()}@brk.sa`, password: "Worker1Pass", roleName: "قسم الحذف", permissions: [{ module: "clients", canAccess: true, canCreate: false, canEdit: false, canDelete: false }] }).expect(201);
    await request(srv()).post("/org/departments/assign").set(auth(token)).send({ userId: staff.body.id, departmentId: dep.body.id }).expect(201);
    await request(srv()).delete(`/org/departments/${dep.body.id}`).set(auth(token)).expect(200);
    const tree = await request(srv()).get("/org/departments").set(auth(token)).expect(200);
    expect(tree.body.find((d: { id: string }) => d.id === dep.body.id)).toBeUndefined();
  });

  it("اسم قصير ⇒ 400", async () => {
    const { token } = await newOwner();
    await request(srv()).post("/org/departments").set(auth(token)).send({ name: "ا" }).expect(400);
  });
});
