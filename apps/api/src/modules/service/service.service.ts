import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@ibp/db";
import { PrismaService } from "../../prisma/prisma.service";
import { SequenceService } from "../../common/sequence/sequence.service";
import { AuditService } from "../../common/audit/audit.service";
import type { CreateServiceRequestDto } from "./dto/service.dto";

const asJson = (v: unknown) => v as Prisma.InputJsonValue;
const FIELDS = {
  id: true, sequenceNo: true, type: true, subject: true, status: true,
  clientId: true, policyId: true, tenantId: true, createdAt: true,
} as const;

/**
 * خدمة العملاء (المرحلة 6): استقبال طلبات العملاء (إضافة/حذف/تعديل/استفسار/تجديد)
 * ومتابعتها حتى الإغلاق. معزولة بالمستأجر ومسجّلة في التدقيق.
 */
@Injectable()
export class ServiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seq: SequenceService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.serviceRequest.findMany({ orderBy: { createdAt: "desc" }, select: FIELDS });
  }

  async create(tenantId: string, userId: string, dto: CreateServiceRequestDto) {
    const sequenceNo = await this.seq.nextServiceSeq();
    const sr = await this.prisma.serviceRequest.create({
      data: {
        tenantId,
        sequenceNo,
        clientId: dto.clientId ?? null,
        policyId: dto.policyId ?? null,
        type: dto.type,
        subject: dto.subject ?? null,
        status: "OPEN",
        details: dto.details ? asJson(dto.details) : undefined,
      },
      select: FIELDS,
    });
    await this.audit.log({ tenantId, userId, action: "create", entity: "service_request", entityId: sr.id, meta: { type: dto.type, sequenceNo } });
    return sr;
  }

  async setStatus(tenantId: string, userId: string, id: string, status: string) {
    const exists = await this.prisma.serviceRequest.findFirst({ where: { id } });
    if (!exists) throw new NotFoundException("طلب الخدمة غير موجود");
    const updated = await this.prisma.serviceRequest.update({ where: { id }, data: { status: status as never }, select: FIELDS });
    await this.audit.log({ tenantId, userId, action: "update", entity: "service_request", entityId: id, meta: { status } });
    return updated;
  }
}
