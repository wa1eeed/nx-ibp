/**
 * الموارد البشرية — ملفّات الموظفين ووثائقهم:
 *  - تحديث ملف التوظيف (الهوية/الجوال يُشفَّران at-rest ويُعادان مفكوكين للقراءة).
 *  - وثائق الموظف (إضافة/حذف) + قائمة الوشيك على الانتهاء.
 *  - محكوم بصلاحية `hr`: مستخدم بلا `hr` ⇒ 403.
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

describe("الموارد البشرية (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: string; // مدير عام (له كل الصلاحيات ومنها hr)
  let ownerId: string;
  let staffId: string;
  const srv = () => app.getHttpServer();
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const uniq = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    owner = (await request(srv()).post("/auth/login").send({ email: "waleed@gulf-demo.sa", password: "Passw0rd!" })).body.accessToken;
    const staff = (await request(srv()).get("/staff").set(auth(owner)).expect(200)).body as Array<{ id: string; email: string }>;
    ownerId = staff.find((u) => u.email === "waleed@gulf-demo.sa")!.id;
    staffId = staff.find((u) => u.email !== "waleed@gulf-demo.sa")!.id;
  });
  afterAll(async () => { await app?.close(); });

  it("تحديث ملف التوظيف: الهوية/الجوال يُشفَّران at-rest ويُعادان مفكوكين", async () => {
    const nid = `1${uniq().replace(/\D/g, "").slice(0, 9)}`;
    const res = await request(srv()).put(`/hr/employees/${staffId}/profile`).set(auth(owner)).send({
      jobTitle: "مدير مبيعات أول", hireDate: "2024-03-01", nationalId: nid, nationalIdExpiry: "2027-01-01", phone: "0555000111", baseSalary: 14500, nationality: "سعودي",
    }).expect(200);
    expect(res.body.jobTitle).toBe("مدير مبيعات أول");
    expect(res.body.nationalId).toBe(nid); // مفكوك للقراءة
    expect(Number(res.body.baseSalary)).toBe(14500);
    // مخزَّن مشفّرًا في القاعدة (ليس النصّ الخام)
    const raw = await prisma.user.findFirst({ where: { id: staffId }, select: { nationalId: true, phone: true } });
    expect(raw!.nationalId).toBeTruthy();
    expect(raw!.nationalId).not.toBe(nid);
    expect(raw!.phone).not.toBe("0555000111");
  });

  it("وثائق الموظف: إضافة ثم ظهورها في القائمة والوشيك على الانتهاء، ثم حذفها", async () => {
    const soon = new Date(); soon.setDate(soon.getDate() + 20);
    const add = await request(srv()).post(`/hr/employees/${staffId}/documents`).set(auth(owner)).send({ type: "iqama", title: `إقامة ${uniq()}`, number: "2233445566", expiryDate: soon.toISOString() }).expect(201);
    const docId = add.body.id;
    const list = (await request(srv()).get(`/hr/employees/${staffId}/documents`).set(auth(owner)).expect(200)).body as Array<{ id: string }>;
    expect(list.find((d) => d.id === docId)).toBeTruthy();
    // الوشيك على الانتهاء يشمل الوثيقة (≤60 يومًا)
    const exp = (await request(srv()).get("/hr/expiring").set(auth(owner)).expect(200)).body as Array<{ userId: string; kind: string }>;
    expect(exp.some((e) => e.userId === staffId)).toBe(true);
    await request(srv()).delete(`/hr/documents/${docId}`).set(auth(owner)).expect(200);
    const after = (await request(srv()).get(`/hr/employees/${staffId}/documents`).set(auth(owner)).expect(200)).body as Array<{ id: string }>;
    expect(after.find((d) => d.id === docId)).toBeFalsy();
  });

  it("الحضور التلقائي عند الدخول: سجلّ اليوم موجود بمصدر login", async () => {
    // الدخول في beforeAll سجّل حضور اليوم تلقائيًا
    const today = (await request(srv()).get("/hr/attendance/today").set(auth(owner)).expect(200)).body;
    expect(today).toBeTruthy();
    expect(today.checkInAt).toBeTruthy();
    expect(today.source).toBe("login");
  });

  it("تسجيل انصراف يدوي + ظهور اليوم في سجلّي الشخصي", async () => {
    const out = (await request(srv()).post("/hr/attendance/check-out").set(auth(owner)).expect(200)).body;
    expect(out.checkOutAt).toBeTruthy();
    const mine = (await request(srv()).get("/hr/attendance/mine?days=7").set(auth(owner)).expect(200)).body as Array<{ checkOutAt: string | null }>;
    expect(mine.length).toBeGreaterThanOrEqual(1);
    expect(mine[0].checkOutAt).toBeTruthy();
  });

  it("لوحة حضور الفريق (للمديرين): تشمل المالك بحالة محدّثة", async () => {
    const team = (await request(srv()).get("/hr/attendance/team").set(auth(owner)).expect(200)).body as { rows: Array<{ userId: string; status: string }> };
    const me = team.rows.find((r) => r.userId === ownerId);
    expect(me).toBeTruthy();
    expect(["in", "out"]).toContain(me!.status);
  });

  it("عزل الصلاحية: موظف بلا صلاحية hr ⇒ 403 على الملف الوظيفي", async () => {
    // موظف جديد بصلاحية dashboard فقط (بلا hr)
    const email = `nohr-${uniq()}@gulf-demo.sa`;
    await request(srv()).post("/staff").set(auth(owner)).send({ fullName: "بلا hr", email, password: "Passw0rd1", roleName: `role-nohr-${uniq()}`, permissions: [{ module: "dashboard", canAccess: true, canCreate: false, canEdit: false, canDelete: false, canRevert: false }] }).expect(201);
    const noHr = (await request(srv()).post("/auth/login").send({ email, password: "Passw0rd1" })).body.accessToken;
    await request(srv()).get(`/hr/employees/${ownerId}/profile`).set(auth(noHr)).expect(403);
  });
});
