import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@ibp/db";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";

const num = (d: Prisma.Decimal | null) => (d == null ? 0 : Number(d));
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * الحسابات البنكية والتسوية البنكية (§1.6). لكل شركة عدّة حسابات؛ يُستورَد كشف البنك وتُطابَق
 * حركاته بسندات النظام (قبض/صرف RCV/PYV) لإبراز الفروق (إيداعات معلّقة/شيكات لم تُصرَف/رسوم بنك).
 * معزول بالمستأجر (ALS) وبصلاحية **`finance`**.
 */
@Injectable()
export class BankService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── الحسابات البنكية ────────────────────────────────────────────────────
  async accounts() {
    const accounts = await this.prisma.bankAccount.findMany({ orderBy: { createdAt: "asc" } });
    const ids = accounts.map((a) => a.id);
    const txns = ids.length ? await this.prisma.bankTransaction.findMany({ where: { bankAccountId: { in: ids } }, select: { bankAccountId: true, amount: true, status: true } }) : [];
    return accounts.map((a) => {
      const t = txns.filter((x) => x.bankAccountId === a.id);
      const statementNet = r2(t.reduce((s, x) => s + num(x.amount), 0));
      return {
        id: a.id, name: a.name, bankName: a.bankName, iban: a.iban, accountNo: a.accountNo, currency: a.currency,
        openingBalance: num(a.openingBalance), isActive: a.isActive,
        balance: r2(num(a.openingBalance) + statementNet), txnCount: t.length, unmatched: t.filter((x) => x.status === "unmatched").length,
      };
    });
  }

  async createAccount(tenantId: string, userId: string, dto: { name: string; bankName?: string; iban?: string; accountNo?: string; currency?: string; openingBalance?: number }) {
    const account = await this.prisma.bankAccount.create({
      data: { tenantId, name: dto.name.trim(), bankName: dto.bankName?.trim() || null, iban: dto.iban?.trim() || null, accountNo: dto.accountNo?.trim() || null, currency: dto.currency || "SAR", openingBalance: dto.openingBalance ?? 0 },
    });
    await this.audit.log({ tenantId, userId, action: "create", entity: "bank_account", entityId: account.id, meta: { name: account.name } });
    return account;
  }

  // ── استيراد كشف البنك + الحركات ──────────────────────────────────────────
  private async ownAccount(bankAccountId: string) {
    const a = await this.prisma.bankAccount.findFirst({ where: { id: bankAccountId } });
    if (!a) throw new NotFoundException("الحساب البنكي غير موجود");
    return a;
  }

  /** استيراد سطور كشف البنك (موجب = إيداع، سالب = سحب). */
  async importTransactions(tenantId: string, userId: string, bankAccountId: string, lines: Array<{ txnDate: string; description: string; amount: number; reference?: string }>) {
    await this.ownAccount(bankAccountId);
    if (!Array.isArray(lines) || lines.length === 0) throw new BadRequestException("لا سطور للاستيراد");
    const data = lines.map((l) => {
      const d = new Date(l.txnDate);
      if (Number.isNaN(+d)) throw new BadRequestException(`تاريخ غير صالح: ${l.txnDate}`);
      if (typeof l.amount !== "number" || !Number.isFinite(l.amount)) throw new BadRequestException("مبلغ غير صالح");
      return { tenantId, bankAccountId, txnDate: d, description: String(l.description ?? "").slice(0, 300), amount: r2(l.amount), reference: l.reference?.slice(0, 120) || null };
    });
    await this.prisma.bankTransaction.createMany({ data });
    await this.audit.log({ tenantId, userId, action: "create", entity: "bank_import", entityId: bankAccountId, meta: { count: data.length } });
    return { imported: data.length };
  }

  async transactions(bankAccountId: string) {
    await this.ownAccount(bankAccountId);
    const rows = await this.prisma.bankTransaction.findMany({ where: { bankAccountId }, orderBy: { txnDate: "desc" } });
    const vIds = [...new Set(rows.map((r) => r.matchedVoucherId).filter((x): x is string => !!x))];
    const vouchers = vIds.length ? await this.prisma.voucher.findMany({ where: { id: { in: vIds } }, select: { id: true, sequenceNo: true, type: true } }) : [];
    const vOf = Object.fromEntries(vouchers.map((v) => [v.id, v]));
    return rows.map((r) => ({
      id: r.id, txnDate: r.txnDate, description: r.description, amount: num(r.amount), reference: r.reference,
      status: r.status, matchedVoucherId: r.matchedVoucherId,
      matchedVoucher: r.matchedVoucherId ? (vOf[r.matchedVoucherId] ?? null) : null,
    }));
  }

  // ── المطابقة ──────────────────────────────────────────────────────────────
  /** مطابقة حركة بنكية بسند نظام (قبض/صرف). */
  async match(tenantId: string, userId: string, txnId: string, voucherId: string) {
    const txn = await this.prisma.bankTransaction.findFirst({ where: { id: txnId } });
    if (!txn) throw new NotFoundException("الحركة البنكية غير موجودة");
    if (txn.status === "matched") throw new ConflictException("الحركة مطابَقة مسبقًا");
    const voucher = await this.prisma.voucher.findFirst({ where: { id: voucherId }, select: { id: true, type: true } });
    if (!voucher) throw new NotFoundException("السند غير موجود");
    if (!["RCV", "PYV"].includes(voucher.type)) throw new BadRequestException("يُطابَق بسند قبض/صرف فقط");
    // منع مطابقة السند نفسه لأكثر من حركة في هذا الحساب
    const dup = await this.prisma.bankTransaction.findFirst({ where: { bankAccountId: txn.bankAccountId, matchedVoucherId: voucherId, status: "matched" }, select: { id: true } });
    if (dup) throw new ConflictException("السند مطابَق لحركة أخرى");
    const updated = await this.prisma.bankTransaction.update({ where: { id: txnId }, data: { matchedVoucherId: voucherId, status: "matched" } });
    await this.audit.log({ tenantId, userId, action: "update", entity: "bank_match", entityId: txnId, meta: { voucherId } });
    return updated;
  }

  /** فكّ المطابقة أو تجاهل حركة (رسوم بنك لا سند لها). */
  async setStatus(tenantId: string, userId: string, txnId: string, status: "unmatched" | "ignored") {
    const txn = await this.prisma.bankTransaction.findFirst({ where: { id: txnId }, select: { id: true } });
    if (!txn) throw new NotFoundException("الحركة البنكية غير موجودة");
    const updated = await this.prisma.bankTransaction.update({ where: { id: txnId }, data: { status, matchedVoucherId: status === "unmatched" ? null : undefined } });
    await this.audit.log({ tenantId, userId, action: "update", entity: "bank_match", entityId: txnId, meta: { status } });
    return updated;
  }

  // ── التسوية ───────────────────────────────────────────────────────────────
  /**
   * ملخّص التسوية لحساب: رصيد الكشف (افتتاحي + صافي الحركات) · المطابَق/غير المطابَق ·
   * وسندات النقد (RCV/PYV) غير المرتبطة بأيّ حركة (مرشّحة للمطابقة — إيداعات/شيكات معلّقة).
   */
  async reconciliation(bankAccountId: string) {
    const account = await this.ownAccount(bankAccountId);
    const txns = await this.prisma.bankTransaction.findMany({ where: { bankAccountId } });
    const opening = num(account.openingBalance);
    const statementNet = r2(txns.reduce((s, t) => s + num(t.amount), 0));
    const matched = txns.filter((t) => t.status === "matched");
    const unmatched = txns.filter((t) => t.status === "unmatched");
    const ignored = txns.filter((t) => t.status === "ignored");
    const matchedNet = r2(matched.reduce((s, t) => s + num(t.amount), 0));

    // سندات النقد غير المطابَقة (مرشّحة) — RCV إيداع (+) · PYV سحب (−)
    const usedVoucherIds = new Set(matched.map((t) => t.matchedVoucherId).filter((x): x is string => !!x));
    const cashVouchers = await this.prisma.voucher.findMany({ where: { type: { in: ["RCV", "PYV"] } }, orderBy: { createdAt: "desc" }, take: 300, select: { id: true, sequenceNo: true, type: true, amount: true, createdAt: true } });
    const unmatchedVouchers = cashVouchers
      .filter((v) => !usedVoucherIds.has(v.id))
      .map((v) => ({ id: v.id, sequenceNo: v.sequenceNo, type: v.type, signedAmount: v.type === "PYV" ? -num(v.amount) : num(v.amount), createdAt: v.createdAt }));

    return {
      account: { id: account.id, name: account.name, currency: account.currency, openingBalance: opening },
      bankBalance: r2(opening + statementNet), // رصيد الكشف الختامي
      bookMatchedBalance: r2(opening + matchedNet), // ما طوبق فعليًا
      difference: r2(statementNet - matchedNet), // فرق التسوية (حركات غير مطابَقة)
      totals: {
        lines: txns.length, matched: matched.length, unmatched: unmatched.length, ignored: ignored.length,
        matchedAmount: matchedNet, unmatchedAmount: r2(unmatched.reduce((s, t) => s + num(t.amount), 0)),
      },
      reconciled: unmatched.length === 0,
      unmatchedTransactions: unmatched.map((t) => ({ id: t.id, txnDate: t.txnDate, description: t.description, amount: num(t.amount), reference: t.reference })),
      unmatchedVouchers,
    };
  }
}
