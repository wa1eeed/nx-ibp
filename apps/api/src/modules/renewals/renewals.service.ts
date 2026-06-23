import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { SequenceService } from "../../common/sequence/sequence.service";
import { AuditService } from "../../common/audit/audit.service";

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
  ) {}

  /** الوثائق المُصدَرة المنتهية خلال (days) يوماً. */
  due(days = 60) {
    const until = new Date();
    until.setDate(until.getDate() + days);
    return this.prisma.policy.findMany({
      where: { status: "ISSUED", endDate: { lte: until } },
      orderBy: { endDate: "asc" },
      select: { id: true, sequenceNo: true, insurerName: true, endDate: true, clientId: true, productLineCode: true, tenantId: true },
    });
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
    return sr;
  }
}
