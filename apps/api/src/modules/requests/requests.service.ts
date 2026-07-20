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
import { ProductScopeService } from "../../common/scope/product-scope.service";
import type { CreateRequestDto } from "./dto/create-request.dto";
import type { UpdateRequestDto } from "./dto/update-request.dto";

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
    private readonly scope: ProductScopeService,
  ) {}

  async list(userId?: string) {
    // نطاق المنتجات: يُقيَّد بالفروع المسموحة للمستخدم (فارغ ⇒ بلا تقييد)
    const scopeWhere = userId ? await this.scope.whereFor(userId) : {};
    return this.prisma.policyRequest.findMany({
      where: scopeWhere,
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

  /** تعديل طلب في حالة DRAFT فقط (قبل بدء دورة التسعير) — يُعيد التحقّق ويستبدل الحقول وصفوف الكتل ذرّياً. */
  async update(tenantId: string, id: string, dto: UpdateRequestDto) {
    const req = await this.prisma.policyRequest.findFirst({ where: { id }, select: { id: true, status: true, productLineCode: true } });
    if (!req) throw new NotFoundException("الطلب غير موجود");
    if (req.status !== "DRAFT") throw new ConflictException("لا يمكن تعديل الطلب بعد بدء دورة التسعير (مسودّة فقط)");

    const line = await this.prisma.productLine.findFirst({ where: { code: req.productLineCode }, include: { formSchema: true } });
    if (!line?.formSchema) throw new NotFoundException("مخطط الفرع غير موجود");
    const sections = (line.formSchema.baseFields ?? []) as unknown as SectionDef[];
    const blocks = (line.formSchema.blocks ?? []) as unknown as BlockDef[];
    const errors = this.validator.validate(sections, blocks, { base: dto.base, blocks: dto.blocks });
    if (errors.length) throw new UnprocessableEntityException({ message: "بيانات النموذج غير صحيحة", errors });

    return this.prisma.$transaction(async (tx) => {
      await tx.policyRequest.update({ where: { id }, data: { base: asJson(dto.base), details: dto.details ? asJson(dto.details) : undefined } });
      await tx.requestBlockRow.deleteMany({ where: { requestId: id } });
      const rows: Array<{ tenantId: string; requestId: string; blockKey: string; rowIndex: number; data: Prisma.InputJsonValue }> = [];
      for (const b of blocks) (dto.blocks?.[b.key] ?? []).forEach((data, idx) => rows.push({ tenantId, requestId: id, blockKey: b.key, rowIndex: idx, data: asJson(data) }));
      if (rows.length) await tx.requestBlockRow.createMany({ data: rows });
      await this.audit.log({ tenantId, action: "update", entity: "request", entityId: id, meta: { status: "DRAFT" } });
      return { id, status: "DRAFT" };
    });
  }

  async create(tenantId: string, userId: string, dto: CreateRequestDto) {
    // 0) نطاق المنتجات: لا يُنشئ المستخدم طلبًا في فرع خارج صلاحياته (غير المقيَّد ⇒ يمرّ)
    await this.scope.assertAllowed(userId, dto.productLineCode);

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
