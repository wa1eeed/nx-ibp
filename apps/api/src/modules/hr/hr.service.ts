import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import { CryptoVaultService } from "../../common/crypto/crypto-vault.service";
import type { AuthUser } from "../auth/current-user.decorator";
import { EMPLOYEE_DOC_TYPES, type CreateEmployeeDocumentDto, type UpdateEmployeeProfileDto } from "./dto/hr.dto";

/**
 * الموارد البشرية — ملفّات الموظفين ووثائقهم. الحقول الحسّاسة (الهوية/الجوال) مشفّرة at-rest (AES-256-GCM)
 * وتُفَكّ عند القراءة فقط لمن يملك صلاحية `hr`. كل الاستعلامات معزولة بالمستأجر (Prisma middleware).
 */
@Injectable()
export class HrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly crypto: CryptoVaultService,
  ) {}

  /** ملف موظف كامل (يفكّ تشفير الهوية/الجوال). */
  async profile(userId: string) {
    const u = await this.prisma.user.findFirst({
      where: { id: userId },
      select: {
        id: true, fullName: true, email: true, status: true, createdAt: true,
        jobTitle: true, hireDate: true, dateOfBirth: true, nationalId: true, nationalIdExpiry: true,
        nationality: true, phone: true, baseSalary: true, emergencyContact: true, addressLine: true,
        role: { select: { name: true } }, department: { select: { name: true } },
      },
    });
    if (!u) throw new NotFoundException("الموظف غير موجود");
    return { ...u, nationalId: this.crypto.tryDecrypt(u.nationalId), phone: this.crypto.tryDecrypt(u.phone) };
  }

  /** تحديث ملف الموارد البشرية (تشفير الهوية/الجوال عند الحفظ). */
  async updateProfile(admin: AuthUser, userId: string, dto: UpdateEmployeeProfileDto) {
    const u = await this.prisma.user.findFirst({ where: { id: userId }, select: { id: true, email: true } });
    if (!u) throw new NotFoundException("الموظف غير موجود");
    const data: Record<string, unknown> = {};
    for (const k of ["jobTitle", "nationality", "emergencyContact", "addressLine"] as const) if (dto[k] !== undefined) data[k] = dto[k] || null;
    for (const k of ["hireDate", "dateOfBirth", "nationalIdExpiry"] as const) if (dto[k] !== undefined) data[k] = dto[k] ? new Date(dto[k]!) : null;
    if (dto.baseSalary !== undefined) data.baseSalary = dto.baseSalary ?? null;
    if (dto.nationalId !== undefined) data.nationalId = dto.nationalId ? this.crypto.encrypt(dto.nationalId) : null;
    if (dto.phone !== undefined) data.phone = dto.phone ? this.crypto.encrypt(dto.phone) : null;
    if (Object.keys(data).length === 0) throw new BadRequestException("لا حقول للتحديث");
    await this.prisma.user.update({ where: { id: userId }, data });
    await this.audit.log({ tenantId: admin.tenantId, userId: admin.userId, action: "update", entity: "employee_profile", entityId: userId, meta: { target: u.email, fields: Object.keys(data) } });
    return this.profile(userId);
  }

  documents(userId: string) {
    return this.prisma.employeeDocument.findMany({ where: { userId }, orderBy: [{ expiryDate: "asc" }, { createdAt: "desc" }] });
  }

  async addDocument(admin: AuthUser, userId: string, dto: CreateEmployeeDocumentDto) {
    if (!(EMPLOYEE_DOC_TYPES as readonly string[]).includes(dto.type)) throw new BadRequestException("نوع وثيقة غير معروف");
    const user = await this.prisma.user.findFirst({ where: { id: userId }, select: { id: true, email: true } });
    if (!user) throw new NotFoundException("الموظف غير موجود");
    const doc = await this.prisma.employeeDocument.create({
      data: {
        tenantId: admin.tenantId, userId, type: dto.type, title: dto.title, number: dto.number ?? null,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : null,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
        fileUrl: dto.fileUrl ?? null,
      },
    });
    await this.audit.log({ tenantId: admin.tenantId, userId: admin.userId, action: "create", entity: "employee_document", entityId: doc.id, meta: { target: user.email, type: dto.type, title: dto.title } });
    return doc;
  }

  async deleteDocument(admin: AuthUser, id: string) {
    const doc = await this.prisma.employeeDocument.findFirst({ where: { id }, select: { id: true, title: true } });
    if (!doc) throw new NotFoundException("الوثيقة غير موجودة");
    await this.prisma.employeeDocument.delete({ where: { id } });
    await this.audit.log({ tenantId: admin.tenantId, userId: admin.userId, action: "delete", entity: "employee_document", entityId: id, meta: { title: doc.title } });
    return { ok: true };
  }

  // ————————————————————————— الحضور والانصراف —————————————————————————

  /** مفتاح اليوم (منتصف ليل UTC ليوم الرياض المحلي) — ثابت للمطابقة على حقل @db.Date. */
  private dayKey(d = new Date()): Date {
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  }

  /**
   * حضور تلقائي عند تسجيل الدخول (يُستدعى من AuthService) — إن لم يُسجَّل اليوم بعد.
   * غير حاجب: يُمرَّر tenantId صراحةً (لا سياق مستأجر أثناء الدخول). لا يلمس سجلًّا موجودًا.
   */
  async recordLogin(userId: string, tenantId: string, employeeName: string) {
    const workDate = this.dayKey();
    const existing = await this.prisma.attendance.findFirst({ where: { tenantId, userId, workDate }, select: { id: true } });
    if (existing) return;
    await this.prisma.attendance.create({ data: { tenantId, userId, employeeName, workDate, checkInAt: new Date(), source: "login" } });
  }

  today(userId: string) {
    return this.prisma.attendance.findFirst({ where: { userId, workDate: this.dayKey() } });
  }

  /** تسجيل حضور يدوي (زر Check-in) — يحفظ أول حضور فقط إن كان اليوم بلا حضور. */
  async checkIn(user: AuthUser) {
    const workDate = this.dayKey();
    const existing = await this.prisma.attendance.findFirst({ where: { userId: user.userId, workDate }, select: { id: true, checkInAt: true } });
    if (existing) {
      if (!existing.checkInAt) await this.prisma.attendance.update({ where: { id: existing.id }, data: { checkInAt: new Date(), source: "manual" } });
      return this.today(user.userId);
    }
    const emp = await this.prisma.user.findFirst({ where: { id: user.userId }, select: { fullName: true } });
    await this.prisma.attendance.create({ data: { tenantId: user.tenantId, userId: user.userId, employeeName: emp?.fullName ?? "", workDate, checkInAt: new Date(), source: "manual" } });
    return this.today(user.userId);
  }

  /** تسجيل انصراف (زر Check-out) — يحدّث آخر انصراف لليوم (يُنشئ سجلًّا إن غاب الحضور). */
  async checkOut(user: AuthUser) {
    const workDate = this.dayKey();
    const existing = await this.prisma.attendance.findFirst({ where: { userId: user.userId, workDate }, select: { id: true } });
    if (existing) {
      await this.prisma.attendance.update({ where: { id: existing.id }, data: { checkOutAt: new Date() } });
    } else {
      const emp = await this.prisma.user.findFirst({ where: { id: user.userId }, select: { fullName: true } });
      const now = new Date();
      await this.prisma.attendance.create({ data: { tenantId: user.tenantId, userId: user.userId, employeeName: emp?.fullName ?? "", workDate, checkInAt: now, checkOutAt: now, source: "manual" } });
    }
    return this.today(user.userId);
  }

  /** سجلّي الشخصي (آخر `days` يومًا). */
  mine(userId: string, days = 30) {
    const from = this.dayKey(); from.setUTCDate(from.getUTCDate() - days);
    return this.prisma.attendance.findMany({ where: { userId, workDate: { gte: from } }, orderBy: { workDate: "desc" } });
  }

  /** لوحة حضور الفريق ليوم (افتراضيًا اليوم) — لكل موظف نشِط حالته: in | out | absent. للمديرين (`hr`). */
  async team(dateStr?: string) {
    const workDate = dateStr ? this.dayKey(new Date(dateStr)) : this.dayKey();
    const [users, recs] = await Promise.all([
      this.prisma.user.findMany({ where: { status: "ACTIVE" }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, department: { select: { name: true } } } }),
      this.prisma.attendance.findMany({ where: { workDate }, select: { userId: true, checkInAt: true, checkOutAt: true, source: true } }),
    ]);
    const byUser = new Map(recs.map((r) => [r.userId, r]));
    return {
      date: workDate,
      rows: users.map((u) => {
        const r = byUser.get(u.id);
        const status = r?.checkInAt ? (r.checkOutAt ? "out" : "in") : "absent";
        return { userId: u.id, name: u.fullName, department: u.department?.name ?? null, checkInAt: r?.checkInAt ?? null, checkOutAt: r?.checkOutAt ?? null, source: r?.source ?? null, status };
      }),
    };
  }

  /** وثائق (وهويات) موظفين وشيكة الانتهاء (≤`days` يومًا) — لتنبيه إدارة الموارد البشرية. */
  async expiring(days = 60) {
    const until = new Date(Date.now() + days * 86_400_000);
    const [docs, ids] = await Promise.all([
      this.prisma.employeeDocument.findMany({ where: { expiryDate: { lte: until } }, orderBy: { expiryDate: "asc" }, take: 100, select: { id: true, userId: true, type: true, title: true, expiryDate: true } }),
      this.prisma.user.findMany({ where: { status: "ACTIVE", nationalIdExpiry: { lte: until } }, select: { id: true, fullName: true, nationalIdExpiry: true } }),
    ]);
    const userIds = [...new Set(docs.map((d) => d.userId))];
    const users = userIds.length ? await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } }) : [];
    const name = Object.fromEntries(users.map((u) => [u.id, u.fullName]));
    const items = [
      ...docs.map((d) => ({ kind: "document", userId: d.userId, employeeName: name[d.userId] ?? "—", label: d.title, type: d.type, expiryDate: d.expiryDate })),
      ...ids.map((u) => ({ kind: "national_id", userId: u.id, employeeName: u.fullName, label: "الهوية/الإقامة", type: "national_id", expiryDate: u.nationalIdExpiry })),
    ].sort((a, b) => (a.expiryDate!.getTime() - b.expiryDate!.getTime()));
    return items;
  }
}
