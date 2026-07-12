import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@ibp/db";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";

export interface InsurerInput {
  name?: string; nameEn?: string; code?: string; licenseNo?: string;
  vatNumber?: string; nationalAddress?: string;
  commissionRate?: number; settlementDays?: number;
  bankName?: string; iban?: string; contactName?: string; contactEmail?: string; contactPhone?: string;
  notes?: string; status?: string;
}

const num = (v: unknown) => Number(v ?? 0);
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * إدارة شركات التأمين (المؤمِّنون): سجلّ + نِسب عمولة/اتفاقيات + دورة تسوية + حساب بنكي،
 * مع **إحصاءات الإنتاج الفعلية** لكل شركة (محسوبة من الوثائق عبر الاسم).
 */
@Injectable()
export class InsurersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** قائمة المؤمِّنين مع إحصاءات إنتاجهم (عدد وثائق/إجمالي أقساط/عمولة) من الوثائق المُصدَرة. */
  async list(tenantId: string) {
    const [insurers, policies] = await Promise.all([
      this.prisma.insurer.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
      this.prisma.policy.findMany({ where: { tenantId, status: "ISSUED" }, select: { insurerName: true, totalPremium: true, commissionAmount: true } }),
    ]);
    const stats = new Map<string, { count: number; grossPremium: number; commission: number }>();
    for (const p of policies) {
      const k = (p.insurerName ?? "").trim();
      const g = stats.get(k) ?? { count: 0, grossPremium: 0, commission: 0 };
      g.count += 1; g.grossPremium = r2(g.grossPremium + num(p.totalPremium)); g.commission = r2(g.commission + num(p.commissionAmount));
      stats.set(k, g);
    }
    return insurers.map((i) => ({
      ...i,
      commissionRate: i.commissionRate != null ? Number(i.commissionRate) : null,
      stats: stats.get(i.name.trim()) ?? { count: 0, grossPremium: 0, commission: 0 },
    }));
  }

  async create(tenantId: string, userId: string, dto: InsurerInput) {
    const data = this.validate(dto);
    if (!data.name) throw new BadRequestException("اسم الشركة مطلوب");
    const insurer = await this.prisma.insurer.create({ data: { tenantId, ...data } as Prisma.InsurerUncheckedCreateInput });
    await this.audit.log({ tenantId, userId, action: "create", entity: "insurer", entityId: insurer.id, meta: { name: insurer.name } });
    return insurer;
  }

  async update(tenantId: string, userId: string, id: string, dto: InsurerInput) {
    const existing = await this.prisma.insurer.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!existing) throw new NotFoundException("شركة التأمين غير موجودة");
    const data = this.validate(dto);
    const insurer = await this.prisma.insurer.update({ where: { id }, data });
    await this.audit.log({ tenantId, userId, action: "update", entity: "insurer", entityId: id, meta: { fields: Object.keys(data) } });
    return insurer;
  }

  async remove(tenantId: string, userId: string, id: string) {
    const r = await this.prisma.insurer.deleteMany({ where: { id, tenantId } });
    if (r.count === 0) throw new NotFoundException("شركة التأمين غير موجودة");
    await this.audit.log({ tenantId, userId, action: "delete", entity: "insurer", entityId: id });
    return { ok: true };
  }

  /** تحقّق وتطبيع المدخلات (يُدرَج فقط ما أُرسِل — للتعديل الجزئي). */
  private validate(dto: InsurerInput): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (dto.name !== undefined) { const n = String(dto.name).trim(); if (n.length < 2) throw new BadRequestException("اسم الشركة حرفان على الأقل"); out.name = n; }
    for (const f of ["nameEn", "code", "licenseNo", "vatNumber", "nationalAddress", "bankName", "iban", "contactName", "contactEmail", "contactPhone", "notes"] as const) {
      if (dto[f] !== undefined) out[f] = String(dto[f]).trim() || null;
    }
    if (dto.commissionRate !== undefined) {
      const c = Number(dto.commissionRate);
      if (!Number.isFinite(c) || c < 0 || c > 100) throw new BadRequestException("نسبة العمولة بين 0 و100");
      out.commissionRate = c;
    }
    if (dto.settlementDays !== undefined) {
      const d = Math.round(Number(dto.settlementDays));
      if (!Number.isFinite(d) || d < 0 || d > 365) throw new BadRequestException("دورة التسوية بين 0 و365 يومًا");
      out.settlementDays = d;
    }
    if (dto.status !== undefined) out.status = dto.status === "inactive" ? "inactive" : "active";
    return out;
  }
}
