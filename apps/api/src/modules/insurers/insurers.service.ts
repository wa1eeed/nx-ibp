import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
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

  /**
   * نظرة 360° لشركة تأمين واحدة — تجمع كل ما يخصّها في مكان واحد بدل تشتّته:
   * وثائقها · عمولتها (مستحقّة/محصّلة/متبقّية) · مطالباتها · سجل تسوياتها (سندات PYV) — مع أسماء العملاء للربط.
   * الربط بالاسم (insurerName نصّي على الوثيقة/المطالبة/العمولة) — مطابق لمنطق القائمة.
   */
  async overview(tenantId: string, id: string) {
    const insurer = await this.prisma.insurer.findFirst({ where: { id, tenantId } });
    if (!insurer) throw new NotFoundException("شركة التأمين غير موجودة");
    const name = insurer.name.trim();

    const [policies, claims, commissions, settlements] = await Promise.all([
      this.prisma.policy.findMany({
        where: { tenantId, insurerName: name },
        orderBy: { createdAt: "desc" },
        select: { id: true, sequenceNo: true, clientId: true, status: true, productLineCode: true, totalPremium: true, commissionAmount: true, startDate: true, endDate: true, createdAt: true },
      }),
      this.prisma.claim.findMany({
        where: { tenantId, insurerName: name },
        orderBy: { createdAt: "desc" },
        select: { id: true, sequenceNo: true, clientId: true, status: true, claimedAmount: true, settledAmount: true, incidentDate: true, createdAt: true },
      }),
      this.prisma.commission.findMany({ where: { tenantId, insurerName: name }, orderBy: { createdAt: "desc" } }),
      this.prisma.voucher.findMany({ where: { tenantId, type: "PYV", reference: name }, orderBy: { createdAt: "desc" }, select: { id: true, sequenceNo: true, amount: true, lines: true, createdAt: true } }),
    ]);

    // أسماء العملاء للربط (لا علاقة Prisma على clientId — نحلّها بجلب دفعة واحدة)
    const clientIds = [...new Set([...policies, ...claims].map((r) => r.clientId).filter((v): v is string => !!v))];
    const clients = clientIds.length ? await this.prisma.client.findMany({ where: { tenantId, id: { in: clientIds } }, select: { id: true, name: true } }) : [];
    const nameOf = new Map(clients.map((c) => [c.id, c.name]));

    const gwp = r2(policies.reduce((s, p) => s + num(p.totalPremium), 0));
    const commissionAccrued = r2(commissions.reduce((s, c) => s + num(c.amount), 0));
    const commissionReceived = r2(commissions.reduce((s, c) => s + num(c.receivedAmount), 0));
    const claimsSettled = r2(claims.reduce((s, c) => s + num(c.settledAmount), 0));
    const settledToInsurer = r2(settlements.reduce((s, v) => s + num(v.amount), 0));

    return {
      insurer: { ...insurer, commissionRate: insurer.commissionRate != null ? Number(insurer.commissionRate) : null },
      stats: {
        policyCount: policies.length,
        gwp,
        commissionAccrued,
        commissionReceived,
        commissionOutstanding: r2(Math.max(0, commissionAccrued - commissionReceived)),
        claimCount: claims.length,
        claimsSettled,
        settledToInsurer,
      },
      policies: policies.map((p) => ({
        id: p.id, sequenceNo: p.sequenceNo, clientId: p.clientId, clientName: p.clientId ? nameOf.get(p.clientId) ?? null : null,
        status: p.status, productLineCode: p.productLineCode, totalPremium: num(p.totalPremium), commissionAmount: num(p.commissionAmount),
        startDate: p.startDate, endDate: p.endDate, createdAt: p.createdAt,
      })),
      commissions: commissions.map((c) => ({
        id: c.id, policyId: c.policyId, clientName: c.clientName, productLine: c.productLine,
        rate: c.rate != null ? Number(c.rate) : null, amount: num(c.amount), receivedAmount: num(c.receivedAmount), status: c.status, periodMonth: c.periodMonth,
      })),
      claims: claims.map((c) => ({
        id: c.id, sequenceNo: c.sequenceNo, clientId: c.clientId, clientName: c.clientId ? nameOf.get(c.clientId) ?? null : null,
        status: c.status, claimedAmount: num(c.claimedAmount), settledAmount: num(c.settledAmount), incidentDate: c.incidentDate, createdAt: c.createdAt,
      })),
      settlements: settlements.map((v) => {
        const meta = (v.lines as { ref?: string | null; paidDate?: string | null } | null) ?? {};
        return { id: v.id, sequenceNo: v.sequenceNo, amount: num(v.amount), reference: meta.ref ?? null, paidDate: meta.paidDate ?? null, createdAt: v.createdAt };
      }),
    };
  }

  /** خيارات مبسّطة للمؤمِّنين النشطين (لنموذج التسعير) — اسم + نسبة العمولة المتّفق عليها لتعبئتها تلقائيًا. */
  async options(tenantId: string) {
    const rows = await this.prisma.insurer.findMany({
      where: { tenantId, status: "active" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, nameEn: true, commissionRate: true, contactEmail: true },
    });
    return rows.map((r) => ({ id: r.id, name: r.name, nameEn: r.nameEn, commissionRate: r.commissionRate != null ? Number(r.commissionRate) : null, contactEmail: r.contactEmail }));
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
    const insurer = await this.prisma.insurer.findFirst({ where: { id, tenantId }, select: { name: true } });
    if (!insurer) throw new NotFoundException("شركة التأمين غير موجودة");
    // حماية سلامة البيانات: الوثائق/المطالبات تحمل اسم الشركة نصًّا؛ حذف السجلّ يقطع ربط
    // العمولة/التسوية/البنك والإحصاء. إن وُجد أي ارتباط ⇒ امنع الحذف ووجّه للتعطيل (status=inactive).
    const [policies, claims] = await Promise.all([
      this.prisma.policy.count({ where: { tenantId, insurerName: insurer.name } }),
      this.prisma.claim.count({ where: { tenantId, insurerName: insurer.name } }),
    ]);
    if (policies > 0 || claims > 0) {
      throw new ConflictException(`لا يمكن حذف «${insurer.name}» لارتباطها بسجلّات (${policies} وثيقة، ${claims} مطالبة). عطّلها بدل الحذف — التعطيل يُخفيها من الاختيار ويحفظ الربط والإحصاء.`);
    }
    await this.prisma.insurer.delete({ where: { id } });
    await this.audit.log({ tenantId, userId, action: "delete", entity: "insurer", entityId: id, meta: { name: insurer.name } });
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
