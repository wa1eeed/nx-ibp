/**
 * اختبار سجل التدقيق غير القابل للتعديل + التقاط IP/الجهاز (مطلب NCA ECC):
 *  - AuditLog immutable: update/delete مرفوض في طبقة Prisma (حتى من الكود).
 *  - كل حدث يلتقط: مَن/الإجراء/الكيان/عنوان IP/الجهاز/متى.
 *  - مراجعة/تصدير عبر سوبر أدمن المنصة (لمفتّشي الهيئة).
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

describe("سجل التدقيق الثابت (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let platform: string;
  const srv = () => app.getHttpServer();
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    platform = (await request(srv()).post("/platform/login").send({ email: "admin@ibp-platform.sa", password: "Passw0rd!" })).body.accessToken;
  });
  afterAll(async () => { await app?.close(); });

  it("immutable: تعديل سجل التدقيق مرفوض", async () => {
    await expect(prisma.auditLog.updateMany({ where: {}, data: { action: "tampered" } })).rejects.toThrow(/immutable/);
  });

  it("immutable: حذف سجل التدقيق مرفوض", async () => {
    await expect(prisma.auditLog.deleteMany({ where: { id: "none" } })).rejects.toThrow(/immutable/);
  });

  it("كل حدث يلتقط IP والإجراء (بعد تسجيل دخول موظف)", async () => {
    await request(srv()).post("/auth/login").send({ email: "waleed@gulf-demo.sa", password: "Passw0rd!" }).expect(201);
    const logs = await request(srv()).get("/platform/audit?limit=50").set(auth(platform)).expect(200);
    const loginEntry = logs.body.find((l: { action: string; ipAddress: string | null }) => l.action === "login" && l.ipAddress);
    expect(loginEntry).toBeTruthy();
    expect(loginEntry.ipAddress).toBeTruthy(); // مَن/من أي جهاز
    expect(loginEntry.entity).toBe("auth");
    expect(loginEntry.createdAt).toBeTruthy();
  });

  it("سوبر أدمن المنصة يراجع السجل (للتفتيش)، والمستأجر ممنوع", async () => {
    const tenantTok = (await request(srv()).post("/auth/login").send({ email: "waleed@gulf-demo.sa", password: "Passw0rd!" })).body.accessToken;
    await request(srv()).get("/platform/audit").set(auth(tenantTok)).expect(403);
  });
});
