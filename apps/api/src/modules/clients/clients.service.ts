import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@ibp/db";
import { PrismaService } from "../../prisma/prisma.service";
import { SequenceService } from "../../common/sequence/sequence.service";
import { AuditService } from "../../common/audit/audit.service";
import type { CreateClientDto } from "./dto/create-client.dto";

const CLIENT_FIELDS = {
  id: true,
  code: true,
  type: true,
  name: true,
  crNumber: true,
  nationalId: true,
  email: true,
  phone: true,
  city: true,
  nationalAddress: true,
  vatNumber: true,
  relationStatus: true,
  legalForm: true,
  source: true,
  producerName: true,
  businessActivity: true,
  iban: true,
  contacts: true,
  status: true,
  complianceStatus: true,
  complianceNote: true,
  tenantId: true,
  createdAt: true,
} as const;

/**
 * سجل العملاء (أفراد/منشآت). معزول تلقائياً بالمستأجر. كود تجاري + بوّابة التزام.
 */
@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seq: SequenceService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.client.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, code: true, type: true, name: true, crNumber: true, nationalId: true, phone: true, city: true, complianceStatus: true, tenantId: true },
    });
  }

  async getOne(id: string) {
    return this.prisma.client.findUnique({ where: { id }, select: CLIENT_FIELDS });
  }

  async create(tenantId: string, userId: string, dto: CreateClientDto) {
    const code = await this.seq.nextClientCode();
    try {
      const client = await this.prisma.client.create({
        data: {
          tenantId,
          code,
          type: dto.type,
          name: dto.name,
          crNumber: dto.crNumber ?? null,
          nationalId: dto.nationalId ?? null,
          email: dto.email ?? null,
          phone: dto.phone ?? null,
          city: dto.city ?? null,
          nationalAddress: dto.nationalAddress ?? null,
          vatNumber: dto.vatNumber ?? null,
          relationStatus: dto.relationStatus ?? null,
          legalForm: dto.legalForm ?? null,
          source: dto.source ?? null,
          producerName: dto.producerName ?? null,
          businessActivity: dto.businessActivity ?? null,
          iban: dto.iban ?? null,
          contacts: dto.contacts ? (dto.contacts as unknown as Prisma.InputJsonValue) : undefined,
          // يبدأ بانتظار اعتماد الالتزام قبل السماح بطلب الأسعار
          complianceStatus: "PENDING",
        },
        select: CLIENT_FIELDS,
      });
      await this.audit.log({ tenantId, userId, action: "create", entity: "client", entityId: client.id, meta: { code } });
      return client;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new ConflictException("عميل بنفس السجل التجاري أو الهوية أو الكود موجود مسبقاً");
      }
      throw e;
    }
  }

  /** بوّابة الالتزام: اعتماد/رفض العميل قبل السماح بطلبات الأسعار. */
  async setCompliance(tenantId: string, userId: string, id: string, decision: "APPROVED" | "REJECTED", note?: string) {
    const exists = await this.prisma.client.findFirst({ where: { id } });
    if (!exists) throw new NotFoundException("العميل غير موجود");

    const updated = await this.prisma.client.update({
      where: { id },
      data: { complianceStatus: decision, complianceNote: note ?? null },
      select: { id: true, name: true, complianceStatus: true, complianceNote: true, tenantId: true },
    });
    await this.audit.log({ tenantId, userId, action: "approve", entity: "client", entityId: id, meta: { decision, note: note ?? null } });
    return updated;
  }
}
