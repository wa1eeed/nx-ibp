import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@ibp/db";
import { PrismaService } from "../../prisma/prisma.service";
import { SequenceService } from "../../common/sequence/sequence.service";
import { AuditService } from "../../common/audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";

const num = (d: Prisma.Decimal | null) => (d == null ? null : Number(d));

/** صلاحية مذكرة التغطية المؤقتة الافتراضية (أيام) — عرف الوساطة: تغطية فورية ريثما تُصدَر الوثيقة. */
const DEFAULT_VALIDITY_DAYS = 30;

/**
 * مذكرة التغطية المؤقتة (Cover Note / Binder — §4.2): تُصدَر عند أمر الإسناد لتوفير **تغطية فورية**
 * للعميل قبل اكتمال إصدار الوثيقة، بصلاحية زمنية محدودة. تُستبدَل تلقائيًا عند إصدار الوثيقة الكاملة.
 * تحت وحدة **الإنتاج** (`production`) ومعزولة بالمستأجر.
 */
@Injectable()
export class CoverNotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seq: SequenceService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private overdue(c: { validUntil: Date; status: string }): boolean {
    return c.status === "active" && new Date(c.validUntil).getTime() < Date.now();
  }

  /** إصدار مذكرة تغطية لطلب مُسنَد (AWARDED) — تُشتقّ شروطها من العرض المختار. */
  async issue(tenantId: string, userId: string, requestId: string, dto: { validityDays?: number; notes?: string }) {
    const request = await this.prisma.policyRequest.findFirst({ where: { id: requestId }, select: { id: true, status: true, clientId: true, productLineCode: true, base: true } });
    if (!request) throw new NotFoundException("الطلب غير موجود");
    if (request.status !== "AWARDED") throw new ConflictException("مذكرة التغطية تتطلّب طلبًا مُسنَدًا (AWARDED — أمر إسناد أولاً)");
    // مذكرة قائمة (غير مُلغاة/مُستبدَلة) لنفس الطلب ⇒ منع التكرار
    const existing = await this.prisma.coverNote.findFirst({ where: { requestId, status: "active" }, select: { id: true, sequenceNo: true } });
    if (existing) throw new ConflictException(`توجد مذكرة تغطية قائمة لهذا الطلب (${existing.sequenceNo ?? existing.id})`);

    // العرض المختار (Firm Order) مصدر الشروط
    const slip = await this.prisma.slip.findFirst({ where: { requestId, selectedQuotationId: { not: null } }, select: { selectedQuotationId: true } });
    const q = slip?.selectedQuotationId ? await this.prisma.quotation.findFirst({ where: { id: slip.selectedQuotationId } }) : null;
    if (!q) throw new BadRequestException("لا عرض مختار لهذا الطلب — لا يمكن إصدار مذكرة تغطية");

    const days = dto.validityDays && dto.validityDays > 0 ? Math.min(dto.validityDays, 90) : DEFAULT_VALIDITY_DAYS;
    const validUntil = new Date(Date.now() + days * 86_400_000);
    // فترة التغطية من بيانات الطلب (base) — تُذكر على المذكرة
    const base = (request.base ?? {}) as { startDate?: string; endDate?: string };
    const startDate = base.startDate ? new Date(base.startDate) : null;
    const endDate = base.endDate ? new Date(base.endDate) : null;
    const sequenceNo = await this.seq.nextCoverNoteSeq();
    const cover = await this.prisma.coverNote.create({
      data: {
        tenantId, sequenceNo, requestId, clientId: request.clientId, quotationId: q.id, insurerName: q.insurerName,
        productLineCode: request.productLineCode, sumInsured: q.sumInsured, premium: q.premium, totalPremium: q.totalPremium,
        deductible: q.deductible, limit: q.limit, startDate, endDate, validUntil, notes: dto.notes?.trim() || null, issuedById: userId,
      },
    });
    await this.audit.log({ tenantId, userId, action: "create", entity: "cover_note", entityId: cover.id, meta: { sequenceNo, requestId } });
    if (request.clientId) {
      const client = await this.prisma.client.findFirst({ where: { id: request.clientId }, select: { email: true, phone: true } });
      void this.notifications.notify(tenantId, "cover_note_issued", { email: client?.email ?? undefined, phone: client?.phone ?? undefined, clientId: request.clientId }, { ref: sequenceNo }).catch(() => undefined);
    }
    return cover;
  }

  /** قائمة مذكرات التغطية (مع اسم العميل وعلم الانتهاء). */
  async list() {
    const rows = await this.prisma.coverNote.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
    const clientIds = [...new Set(rows.map((r) => r.clientId).filter((x): x is string => !!x))];
    const clients = clientIds.length ? await this.prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true } }) : [];
    const nameOf = Object.fromEntries(clients.map((c) => [c.id, c.name]));
    return rows.map((r) => ({
      id: r.id, sequenceNo: r.sequenceNo, clientName: r.clientId ? (nameOf[r.clientId] ?? "—") : null, insurerName: r.insurerName,
      productLineCode: r.productLineCode, totalPremium: num(r.totalPremium), validUntil: r.validUntil, status: r.status,
      expired: this.overdue(r), policyId: r.policyId, createdAt: r.createdAt,
    }));
  }

  async detail(id: string) {
    const c = await this.prisma.coverNote.findFirst({ where: { id } });
    if (!c) throw new NotFoundException("مذكرة التغطية غير موجودة");
    const client = c.clientId ? await this.prisma.client.findFirst({ where: { id: c.clientId }, select: { name: true } }) : null;
    return { ...c, clientName: client?.name ?? null, expired: this.overdue(c) };
  }

  /** إلغاء مذكرة تغطية (قبل الإصدار). */
  async cancel(tenantId: string, userId: string, id: string) {
    const c = await this.prisma.coverNote.findFirst({ where: { id }, select: { id: true, status: true } });
    if (!c) throw new NotFoundException("مذكرة التغطية غير موجودة");
    if (c.status !== "active") throw new ConflictException("لا يمكن إلغاء مذكرة غير قائمة");
    const updated = await this.prisma.coverNote.update({ where: { id }, data: { status: "cancelled" } });
    await this.audit.log({ tenantId, userId, action: "update", entity: "cover_note", entityId: id, meta: { cancelled: true } });
    return updated;
  }

  /** بيانات المستند المطبوع (بهوية المستأجر) — تُصيَّر في الواجهة كمذكرة قابلة للطباعة. */
  async document(tenantId: string, id: string) {
    const c = await this.prisma.coverNote.findFirst({ where: { id } });
    if (!c) throw new NotFoundException("مذكرة التغطية غير موجودة");
    const [tenant, client] = await Promise.all([
      this.prisma.tenant.findFirst({ where: { id: tenantId }, select: { name: true, nameEn: true, crNumber: true, vatNumber: true, phone: true, buildingNo: true, street: true, district: true, city: true, postalCode: true } }),
      c.clientId ? this.prisma.client.findFirst({ where: { id: c.clientId }, select: { name: true, vatNumber: true, nationalAddress: true, city: true } }) : Promise.resolve(null),
    ]);
    return {
      coverNote: {
        id: c.id, sequenceNo: c.sequenceNo, status: c.status, expired: this.overdue(c),
        insurerName: c.insurerName, productLineCode: c.productLineCode,
        sumInsured: num(c.sumInsured), premium: num(c.premium), totalPremium: num(c.totalPremium),
        deductible: num(c.deductible), limit: num(c.limit),
        startDate: c.startDate, endDate: c.endDate, validUntil: c.validUntil, notes: c.notes,
        issuedAt: new Date(c.createdAt).toISOString(),
      },
      seller: { name: tenant?.name ?? "—", nameEn: tenant?.nameEn ?? null, vatNumber: tenant?.vatNumber ?? null, crNumber: tenant?.crNumber ?? null, phone: tenant?.phone ?? null, address: { buildingNo: tenant?.buildingNo ?? null, street: tenant?.street ?? null, district: tenant?.district ?? null, city: tenant?.city ?? null, postalCode: tenant?.postalCode ?? null } },
      client: client ? { name: client.name, vatNumber: client.vatNumber, address: [client.nationalAddress, client.city].filter(Boolean).join("، ") || null } : null,
    };
  }
}
