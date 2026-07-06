import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@ibp/db";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import { CreateFormTemplateDto, UpdateFormTemplateDto } from "./dto/form-template.dto";

const asJson = (v: unknown) => v as Prisma.InputJsonValue;

/**
 * مكتبة قوالب النماذج الديناميكية — قوالب معبّأة مسبقًا لخطوط المنتجات تُسرّع إنشاء الطلبات.
 * القالب مجرّد بيانات تعبئة أولية (base + blocks) تُطبَّق على النموذج، ويُتحقّق منها عند تقديم الطلب.
 */
@Injectable()
export class FormTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** قوالب فعّالة، اختيارياً حسب خطّ المنتج، الأكثر استخدامًا أولًا. */
  list(productLineCode?: string) {
    return this.prisma.formTemplate.findMany({
      where: { isActive: true, ...(productLineCode ? { productLineCode } : {}) },
      orderBy: [{ usageCount: "desc" }, { createdAt: "desc" }],
      select: { id: true, name: true, productLineCode: true, description: true, usageCount: true, createdAt: true },
    });
  }

  async get(id: string) {
    const tpl = await this.prisma.formTemplate.findFirst({ where: { id } });
    if (!tpl) throw new NotFoundException("القالب غير موجود");
    return tpl;
  }

  async create(tenantId: string, userId: string, dto: CreateFormTemplateDto) {
    const line = await this.prisma.productLine.findFirst({ where: { code: dto.productLineCode }, select: { code: true } });
    if (!line) throw new BadRequestException("خطّ المنتج غير موجود");
    const tpl = await this.prisma.formTemplate.create({
      data: { tenantId, name: dto.name, productLineCode: dto.productLineCode, description: dto.description ?? null, base: asJson(dto.base ?? {}), blocks: dto.blocks ? asJson(dto.blocks) : Prisma.JsonNull },
      select: { id: true, name: true, productLineCode: true, description: true, usageCount: true, createdAt: true },
    });
    await this.audit.log({ tenantId, userId, action: "create", entity: "form_template", entityId: tpl.id, meta: { name: dto.name, line: dto.productLineCode } });
    return tpl;
  }

  async update(tenantId: string, userId: string, id: string, dto: UpdateFormTemplateDto) {
    const existing = await this.prisma.formTemplate.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException("القالب غير موجود");
    const data: Prisma.FormTemplateUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.base !== undefined) data.base = asJson(dto.base);
    if (dto.blocks !== undefined) data.blocks = dto.blocks ? asJson(dto.blocks) : Prisma.JsonNull;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    const tpl = await this.prisma.formTemplate.update({ where: { id }, data, select: { id: true, name: true, productLineCode: true, description: true, usageCount: true, isActive: true } });
    await this.audit.log({ tenantId, userId, action: "update", entity: "form_template", entityId: id, meta: { fields: Object.keys(dto) } });
    return tpl;
  }

  async remove(tenantId: string, userId: string, id: string) {
    const existing = await this.prisma.formTemplate.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException("القالب غير موجود");
    await this.prisma.formTemplate.delete({ where: { id } });
    await this.audit.log({ tenantId, userId, action: "delete", entity: "form_template", entityId: id, meta: { name: existing.name } });
    return { deleted: true, id };
  }

  /** تطبيق قالب: يزيد عدّاد الاستخدام ويعيد بيانات التعبئة للنموذج. */
  async apply(id: string) {
    const tpl = await this.prisma.formTemplate.findFirst({ where: { id, isActive: true } });
    if (!tpl) throw new NotFoundException("القالب غير موجود");
    await this.prisma.formTemplate.update({ where: { id }, data: { usageCount: { increment: 1 } } });
    return { id: tpl.id, name: tpl.name, productLineCode: tpl.productLineCode, base: tpl.base, blocks: tpl.blocks };
  }
}
