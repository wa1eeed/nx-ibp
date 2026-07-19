import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { Prisma } from "@ibp/db";
import { PrismaService } from "../../prisma/prisma.service";
import { SequenceService } from "../../common/sequence/sequence.service";
import { AuditService } from "../../common/audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";

const asJson = (v: unknown) => v as Prisma.InputJsonValue;

/**
 * التجديدات (المرحلة 6): عرض الوثائق المستحقّة للتجديد ضمن نافذة زمنية،
 * و**بدء دورة تجديد فعلية**: إنشاء طلب تأمين (PolicyRequest) مبني على بيانات الوثيقة
 * المنتهية (استنساخ مسبق التعبئة + رابط سلسلة التجديد) يدخل دورة RFQ⇐عرض⇐إصدار من جديد.
 * لا يُطلق تذكيرًا تلقائيًا للعميل عند البدء (التذكير المبكّر مهمّة المجدول؛ والتواصل الفعلي
 * هو إرسال عرض التجديد لاحقًا) — بل يُشعر فريق التجديدات داخليًا فقط. معزولة بالمستأجر.
 */
@Injectable()
export class RenewalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seq: SequenceService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** الوثائق المُصدَرة المنتهية خلال (days) يوماً — مُثراة باسم العميل والقسط (للوحة التجديدات). */
  async due(days = 60) {
    const until = new Date();
    until.setDate(until.getDate() + days);
    const rows = await this.prisma.policy.findMany({
      where: { status: "ISSUED", endDate: { lte: until } },
      orderBy: { endDate: "asc" },
      select: { id: true, sequenceNo: true, insurerName: true, endDate: true, totalPremium: true, commissionAmount: true, clientId: true, productLineCode: true, tenantId: true },
    });
    const clientIds = [...new Set(rows.map((r) => r.clientId).filter(Boolean) as string[])];
    const clients = clientIds.length ? await this.prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true } }) : [];
    const nameOf = new Map(clients.map((c) => [c.id, c.name]));
    // طلبات التجديد القائمة (غير المرفوضة) لهذه الوثائق — حتى يعرض الزرّ «عرض طلب التجديد» مباشرةً بدل «بدء التجديد»
    const policyIds = rows.map((r) => r.id);
    const openRenewals = policyIds.length
      ? await this.prisma.policyRequest.findMany({
          where: { renewedFromPolicyId: { in: policyIds }, status: { not: "REJECTED" } },
          select: { id: true, renewedFromPolicyId: true },
        })
      : [];
    const renewalOf = new Map(openRenewals.map((rq) => [rq.renewedFromPolicyId as string, rq.id]));
    return rows.map((r) => ({ ...r, clientName: r.clientId ? nameOf.get(r.clientId) ?? null : null, renewalRequestId: renewalOf.get(r.id) ?? null }));
  }

  /**
   * بدء دورة تجديد فعلية للوثيقة المنتهية: يُنشئ طلب تأمين جديدًا (PolicyRequest) مبنيًا على
   * بيانات الطلب الأصلي للوثيقة (استنساخ base/details وصفوف الكتل) + رابط `renewedFromPolicyId`.
   * يمنع التكرار (طلب تجديد قائم لنفس الوثيقة ⇒ 409). لا تذكير تلقائي للعميل.
   */
  async initiate(tenantId: string, userId: string, policyId: string) {
    const policy = await this.prisma.policy.findFirst({ where: { id: policyId } });
    if (!policy) throw new NotFoundException("الوثيقة غير موجودة");
    if (!policy.clientId || !policy.productLineCode) {
      throw new UnprocessableEntityException("الوثيقة تفتقر لعميل أو فرع منتج — لا يمكن بناء طلب تجديد");
    }

    // منع التكرار: طلب تجديد قائم (غير مرفوض) لنفس الوثيقة
    const existing = await this.prisma.policyRequest.findFirst({
      where: { renewedFromPolicyId: policyId, status: { not: "REJECTED" } },
      select: { id: true, sequenceNo: true },
    });
    if (existing) throw new ConflictException(`يوجد طلب تجديد قائم لهذه الوثيقة بالفعل (${existing.sequenceNo ?? existing.id})`);

    // استنساخ بيانات الطلب الأصلي إن وُجد (تعبئة مسبقة)
    const source = policy.requestId
      ? await this.prisma.policyRequest.findFirst({ where: { id: policy.requestId }, select: { base: true, details: true } })
      : null;
    const line = await this.prisma.productLine.findFirst({ where: { code: policy.productLineCode }, include: { class: true } });
    const sequenceNo = await this.seq.nextRequestSeq(line?.class.code ?? "GEN");

    const req = await this.prisma.policyRequest.create({
      data: {
        tenantId,
        clientId: policy.clientId,
        productLineCode: policy.productLineCode,
        status: "DRAFT",
        sequenceNo,
        base: asJson(source?.base ?? {}),
        details: source?.details != null ? asJson(source.details) : undefined,
        renewedFromPolicyId: policyId,
      },
      select: { id: true, sequenceNo: true, status: true, productLineCode: true, tenantId: true },
    });

    // نسخ صفوف الكتل من الطلب الأصلي (إن وُجدت) حتى يبدأ الوسيط من نسخة مطابقة
    if (policy.requestId) {
      const srcRows = await this.prisma.requestBlockRow.findMany({
        where: { requestId: policy.requestId },
        select: { blockKey: true, rowIndex: true, data: true },
      });
      if (srcRows.length) {
        await this.prisma.requestBlockRow.createMany({
          data: srcRows.map((r) => ({ tenantId, requestId: req.id, blockKey: r.blockKey, rowIndex: r.rowIndex, data: asJson(r.data) })),
        });
      }
    }

    await this.audit.log({ tenantId, userId, action: "create", entity: "renewal", entityId: req.id, meta: { policyId, requestId: req.id } });
    // إشعار فريق التجديدات فقط ببدء دورة التجديد (لا تذكير تلقائي للعميل)
    void this.notifications.notifyStaff(tenantId, "staff_renewal_due", { ref: String(policy.sequenceNo ?? sequenceNo) }).catch(() => undefined);
    return req;
  }
}
