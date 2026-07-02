import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Prisma } from "@ibp/db";
import { PrismaService } from "../../prisma/prisma.service";
import { SequenceService } from "../../common/sequence/sequence.service";
import { AuditService } from "../../common/audit/audit.service";
import { FormValidationService, type SectionDef, type BlockDef } from "./form-validation.service";
import { NotificationsService } from "../notifications/notifications.service";
import type { CreateRequestDto } from "./dto/create-request.dto";

const asJson = (v: unknown) => v as Prisma.InputJsonValue;

/**
 * محرّك طلب التأمين: يتحقّق من الحمولة ضد مخطط الفرع، يفرض بوّابة الالتزام،
 * يخزّن الحقول الأساسية + صفوف الكتل العامة، ويولّد رقم تسلسل.
 */
@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seq: SequenceService,
    private readonly audit: AuditService,
    private readonly validator: FormValidationService,
    private readonly notifications: NotificationsService,
  ) {}

  list() {
    return this.prisma.policyRequest.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        sequenceNo: true,
        productLineCode: true,
        status: true,
        tenantId: true,
        createdAt: true,
        client: { select: { id: true, name: true, code: true } },
      },
    });
  }

  async getOne(id: string) {
    const req = await this.prisma.policyRequest.findFirst({
      where: { id },
      select: {
        id: true,
        sequenceNo: true,
        productLineCode: true,
        status: true,
        base: true,
        tenantId: true,
        createdAt: true,
        client: { select: { id: true, name: true, code: true } },
        blockRows: {
          orderBy: [{ blockKey: "asc" }, { rowIndex: "asc" }],
          select: { blockKey: true, rowIndex: true, data: true },
        },
      },
    });
    if (!req) throw new NotFoundException("الطلب غير موجود");
    return req;
  }

  async create(tenantId: string, userId: string, dto: CreateRequestDto) {
    // 1) العميل ضمن المستأجر
    const client = await this.prisma.client.findFirst({ where: { id: dto.clientId } });
    if (!client) throw new NotFoundException("العميل غير موجود");

    // 2) بوّابة الالتزام: لا طلب أسعار قبل اعتماد العميل
    if (client.complianceStatus !== "APPROVED") {
      throw new ConflictException("لا يمكن إنشاء طلب: العميل غير معتمد من الالتزام بعد");
    }

    // 3) مخطط الفرع
    const line = await this.prisma.productLine.findFirst({
      where: { code: dto.productLineCode },
      include: { class: true, formSchema: true },
    });
    if (!line?.formSchema) throw new NotFoundException("فرع المنتج أو مخططه غير موجود");

    // 4) التحقّق ضد المخطط
    const sections = (line.formSchema.baseFields ?? []) as unknown as SectionDef[];
    const blocks = (line.formSchema.blocks ?? []) as unknown as BlockDef[];
    const errors = this.validator.validate(sections, blocks, { base: dto.base, blocks: dto.blocks });
    if (errors.length) {
      throw new UnprocessableEntityException({ message: "بيانات النموذج غير صحيحة", errors });
    }

    // 5) رقم تسلسل
    const sequenceNo = await this.seq.nextRequestSeq(line.class.code);

    // 6) إنشاء الطلب + صفوف الكتل ذرّياً
    const request = await this.prisma.$transaction(async (tx) => {
      const req = await tx.policyRequest.create({
        data: {
          tenantId,
          clientId: client.id,
          productLineCode: dto.productLineCode,
          status: "DRAFT",
          sequenceNo,
          base: asJson(dto.base),
          details: dto.details ? asJson(dto.details) : undefined,
        },
        select: { id: true, sequenceNo: true, status: true, productLineCode: true, tenantId: true },
      });

      const rows: Array<{ tenantId: string; requestId: string; blockKey: string; rowIndex: number; data: Prisma.InputJsonValue }> = [];
      for (const b of blocks) {
        const arr = dto.blocks?.[b.key] ?? [];
        arr.forEach((data, idx) =>
          rows.push({ tenantId, requestId: req.id, blockKey: b.key, rowIndex: idx, data: asJson(data) }),
        );
      }
      if (rows.length) await tx.requestBlockRow.createMany({ data: rows });

      return req;
    });

    await this.audit.log({
      tenantId,
      userId,
      action: "create",
      entity: "policy_request",
      entityId: request.id,
      meta: { line: dto.productLineCode, sequenceNo },
    });

    // إشعار فريق التسعير بطلب تأمين جديد
    void this.notifications.notifyStaff(tenantId, "staff_request_created", { ref: sequenceNo }).catch(() => undefined);

    return request;
  }
}
