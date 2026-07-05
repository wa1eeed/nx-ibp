import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@ibp/db";
import { PrismaService } from "../../prisma/prisma.service";
import { SequenceService } from "../../common/sequence/sequence.service";
import { AuditService } from "../../common/audit/audit.service";
import { CreateProducerDto, SettleProducerDto, UpdateProducerDto } from "./dto/producer.dto";

const asJson = (v: unknown) => v as Prisma.InputJsonValue;
const r2 = (n: number) => +n.toFixed(2);
const num = (d: unknown) => (d == null ? 0 : Number(d));
const REF = (id: string) => `prd:${id}`; // مرجع سندات صرف المنتِجين (يميّزها عن تسوية المؤمِّنين)

/**
 * سجلّ المنتِجين (الوسطاء الفرعيون) وعمولاتهم — بند 6 نحو تجاوز أويسس.
 * المنتِج يجلب أعمالاً مقابل حصّة من عمولة الوسيط؛ عمولته مصروف على الوسيط (حساب 05010)،
 * وتُسوّى بسند صرف. دفتر المنتِج مشتقّ من وثائقه المُصدَرة (Σ producerCommission) مطروحاً منه المُسوّى.
 */
@Injectable()
export class ProducersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seq: SequenceService,
    private readonly audit: AuditService,
  ) {}

  /** دفتر المنتِجين: لكل منتِج عدد وثائقه، إجمالي القسط، العمولة المستحقّة له، المُسوّى، المتبقّي. */
  async list() {
    const producers = await this.prisma.producer.findMany({ orderBy: { createdAt: "desc" } });
    const ids = producers.map((p) => p.id);
    const [policies, settlements] = await Promise.all([
      ids.length ? this.prisma.policy.findMany({ where: { producerId: { in: ids }, status: "ISSUED" }, select: { producerId: true, totalPremium: true, producerCommission: true } }) : Promise.resolve([]),
      this.prisma.voucher.findMany({ where: { type: "PYV" }, select: { amount: true, reference: true } }),
    ]);
    const paidBy = new Map<string, number>();
    for (const s of settlements) { if (s.reference) paidBy.set(s.reference, r2((paidBy.get(s.reference) ?? 0) + num(s.amount))); }
    const agg = new Map<string, { count: number; gross: number; owed: number }>();
    for (const p of policies) {
      const k = p.producerId ?? "—";
      const g = agg.get(k) ?? { count: 0, gross: 0, owed: 0 };
      g.count += 1; g.gross = r2(g.gross + num(p.totalPremium)); g.owed = r2(g.owed + num(p.producerCommission));
      agg.set(k, g);
    }
    const rows = producers.map((p) => {
      const a = agg.get(p.id) ?? { count: 0, gross: 0, owed: 0 };
      const paid = paidBy.get(REF(p.id)) ?? 0;
      return { ...p, policies: a.count, grossPremium: a.gross, commissionOwed: a.owed, paid: r2(paid), outstanding: r2(Math.max(0, a.owed - paid)) };
    });
    const summary = {
      producers: rows.length,
      active: rows.filter((r) => r.status !== "suspended").length,
      commissionOwed: r2(rows.reduce((s, r) => s + r.commissionOwed, 0)),
      paid: r2(rows.reduce((s, r) => s + r.paid, 0)),
      outstanding: r2(rows.reduce((s, r) => s + r.outstanding, 0)),
    };
    return { rows, summary };
  }

  /** تفصيل منتِج: بياناته + وثائقه المُصدَرة + سندات صرفه + الدفتر. */
  async get(id: string) {
    const producer = await this.prisma.producer.findFirst({ where: { id } });
    if (!producer) throw new NotFoundException("المنتِج غير موجود");
    const [policies, settlements] = await Promise.all([
      this.prisma.policy.findMany({ where: { producerId: id }, orderBy: { createdAt: "desc" }, select: { id: true, sequenceNo: true, clientId: true, insurerName: true, productLineCode: true, totalPremium: true, commissionAmount: true, producerCommission: true, status: true, createdAt: true } }),
      this.prisma.voucher.findMany({ where: { type: "PYV", reference: REF(id) }, orderBy: { createdAt: "desc" }, select: { id: true, sequenceNo: true, amount: true, createdAt: true } }),
    ]);
    const clientIds = [...new Set(policies.map((p) => p.clientId).filter((x): x is string => !!x))];
    const clients = clientIds.length ? await this.prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true } }) : [];
    const nameOf = Object.fromEntries(clients.map((c) => [c.id, c.name]));
    const issued = policies.filter((p) => p.status === "ISSUED");
    const owed = r2(issued.reduce((s, p) => s + num(p.producerCommission), 0));
    const paid = r2(settlements.reduce((s, v) => s + num(v.amount), 0));
    return {
      producer,
      policies: policies.map((p) => ({ ...p, clientName: nameOf[p.clientId ?? ""] ?? "—" })),
      settlements,
      ledger: { policies: issued.length, grossPremium: r2(issued.reduce((s, p) => s + num(p.totalPremium), 0)), commissionOwed: owed, paid, outstanding: r2(Math.max(0, owed - paid)) },
    };
  }

  async create(tenantId: string, userId: string, dto: CreateProducerDto) {
    const code = await this.seq.nextProducerSeq();
    const producer = await this.prisma.producer.create({ data: { tenantId, code, name: dto.name, type: dto.type ?? "INDIVIDUAL", licenseNo: dto.licenseNo ?? null, crNumber: dto.crNumber ?? null, nationalId: dto.nationalId ?? null, email: dto.email ?? null, phone: dto.phone ?? null, iban: dto.iban ?? null, commissionRate: dto.commissionRate ?? null, status: dto.status ?? "active", notes: dto.notes ?? null } });
    await this.audit.log({ tenantId, userId, action: "create", entity: "producer", entityId: producer.id, meta: { code, name: dto.name } });
    return producer;
  }

  async update(tenantId: string, userId: string, id: string, dto: UpdateProducerDto) {
    const existing = await this.prisma.producer.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException("المنتِج غير موجود");
    const producer = await this.prisma.producer.update({ where: { id }, data: { ...dto } });
    await this.audit.log({ tenantId, userId, action: "update", entity: "producer", entityId: id, meta: { fields: Object.keys(dto) } });
    return producer;
  }

  /** سند صرف (PYV) لتسوية عمولة المنتِج — يمنع تجاوز المستحقّ. قيد: مصروف عمولات المنتِجين (05010) ⇒ نقد. */
  async settle(tenantId: string, userId: string, id: string, dto: SettleProducerDto) {
    const producer = await this.prisma.producer.findFirst({ where: { id } });
    if (!producer) throw new NotFoundException("المنتِج غير موجود");
    const detail = await this.get(id);
    if (dto.amount > detail.ledger.outstanding + 0.001) throw new ConflictException(`المبلغ يتجاوز المتبقّي المستحقّ (${detail.ledger.outstanding})`);
    const seq = await this.seq.nextVoucherSeq("PYV");
    const voucher = await this.prisma.voucher.create({
      data: {
        tenantId, type: "PYV", sequenceNo: seq, amount: r2(dto.amount), status: "posted", isAuto: false, reference: REF(id),
        lines: asJson({
          description: `صرف عمولة المنتِج ${producer.name}`, ref: dto.reference ?? null, paidDate: dto.paidDate ?? null, producerId: id,
          entries: [
            { account: "05010000000000000", name: "عمولات المنتِجين (الوسطاء الفرعيون)", debit: r2(dto.amount), credit: 0 },
            { account: "01010000000000000", name: "النقد والبنوك", debit: 0, credit: r2(dto.amount) },
          ],
        }),
      },
    });
    await this.audit.log({ tenantId, userId, action: "create", entity: "producer_settlement", entityId: voucher.id, meta: { producerId: id, amount: r2(dto.amount) } });
    const outstanding = r2(detail.ledger.outstanding - dto.amount);
    return { voucher: { id: voucher.id, sequenceNo: voucher.sequenceNo }, producerId: id, paid: r2(detail.ledger.paid + dto.amount), outstanding };
  }
}
