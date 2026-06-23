import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@ibp/db";
import { PrismaService } from "../../prisma/prisma.service";
import { SequenceService } from "../../common/sequence/sequence.service";
import { AuditService } from "../../common/audit/audit.service";
import type { CreateClaimDto } from "./dto/claim.dto";

const asJson = (v: unknown) => v as Prisma.InputJsonValue;
const FIELDS = {
  id: true, sequenceNo: true, status: true, insurerName: true, clientId: true, policyId: true,
  claimedAmount: true, deductible: true, settledAmount: true, incidentDate: true, tenantId: true, createdAt: true,
} as const;

/**
 * المطالبات (المرحلة 6): دورة حياة كاملة — استقبال ← تحقّق ← رفع للمؤمِّن ← تسوية ← إغلاق.
 * معزولة بالمستأجر، محكومة بـ entitlement module.claims، ومسجّلة في التدقيق.
 */
@Injectable()
export class ClaimsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seq: SequenceService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.claim.findMany({ orderBy: { createdAt: "desc" }, select: FIELDS });
  }

  async getOne(id: string) {
    const claim = await this.prisma.claim.findFirst({ where: { id }, select: FIELDS });
    if (!claim) throw new NotFoundException("المطالبة غير موجودة");
    return claim;
  }

  async create(tenantId: string, userId: string, dto: CreateClaimDto) {
    const sequenceNo = await this.seq.nextClaimSeq();
    const claim = await this.prisma.claim.create({
      data: {
        tenantId,
        sequenceNo,
        clientId: dto.clientId ?? null,
        policyId: dto.policyId ?? null,
        insurerName: dto.insurerName ?? null,
        incidentDate: dto.incidentDate ? new Date(dto.incidentDate) : null,
        claimedAmount: dto.claimedAmount ?? null,
        deductible: dto.deductible ?? null,
        status: "RECEIVED",
        details: dto.details ? asJson(dto.details) : undefined,
      },
      select: FIELDS,
    });
    await this.audit.log({ tenantId, userId, action: "create", entity: "claim", entityId: claim.id, meta: { sequenceNo } });
    return claim;
  }

  async setStatus(tenantId: string, userId: string, id: string, status: string, settledAmount?: number) {
    const exists = await this.prisma.claim.findFirst({ where: { id } });
    if (!exists) throw new NotFoundException("المطالبة غير موجودة");
    const claim = await this.prisma.claim.update({
      where: { id },
      data: { status: status as never, settledAmount: settledAmount ?? undefined },
      select: FIELDS,
    });
    await this.audit.log({ tenantId, userId, action: "update", entity: "claim", entityId: id, meta: { status, settledAmount } });
    return claim;
  }
}
