import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { SequenceService } from "../../common/sequence/sequence.service";
import { AuditService } from "../../common/audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";

/**
 * التجديدات (المرحلة 6): عرض الوثائق المستحقّة للتجديد ضمن نافذة زمنية،
 * وبدء طلب تجديد (ServiceRequest type=renewal). معزولة بالمستأجر.
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
    return rows.map((r) => ({ ...r, clientName: r.clientId ? nameOf.get(r.clientId) ?? null : null }));
  }

  async initiate(tenantId: string, userId: string, policyId: string) {
    const policy = await this.prisma.policy.findFirst({ where: { id: policyId } });
    if (!policy) throw new NotFoundException("الوثيقة غير موجودة");
    const sequenceNo = await this.seq.nextServiceSeq();
    const sr = await this.prisma.serviceRequest.create({
      data: {
        tenantId,
        sequenceNo,
        clientId: policy.clientId,
        policyId,
        type: "renewal",
        subject: `تجديد الوثيقة ${policy.sequenceNo ?? policyId}`,
        status: "OPEN",
      },
      select: { id: true, sequenceNo: true, type: true, status: true, policyId: true, tenantId: true },
    });
    await this.audit.log({ tenantId, userId, action: "create", entity: "renewal", entityId: sr.id, meta: { policyId } });
    // تذكير العميل باستحقاق تجديد وثيقته (لا يُفشل بدء التجديد عند تعذّره)
    if (policy.clientId) {
      const client = await this.prisma.client.findFirst({ where: { id: policy.clientId }, select: { email: true, phone: true } });
      if (client) void this.notifications.notify(tenantId, "renewal_reminder", { email: client.email ?? undefined, phone: client.phone ?? undefined, clientId: policy.clientId ?? undefined }, { ref: String(policy.sequenceNo ?? sequenceNo) }).catch(() => undefined);
    }
    // إشعار فريق التجديدات ببدء إجراء تجديد
    void this.notifications.notifyStaff(tenantId, "staff_renewal_due", { ref: String(policy.sequenceNo ?? sequenceNo) }).catch(() => undefined);
    return sr;
  }
}
