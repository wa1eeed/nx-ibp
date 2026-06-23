import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@ibp/db";
import { PrismaService } from "../../prisma/prisma.service";
import { SequenceService } from "../../common/sequence/sequence.service";
import { AuditService } from "../../common/audit/audit.service";

const asJson = (v: unknown) => v as Prisma.InputJsonValue;
const r2 = (n: number) => +n.toFixed(2);

/**
 * الهندسة المالية (المرحلة 4ب): الاعتماد المالي للوثيقة يُولّد آلياً:
 *  1) قيد يومية (JRV) — قيد مزدوج متوازن يُظهر الفصل الائتماني (On/Off-Balance).
 *  2) إشعار مدين (Debit Note) للعميل.
 *  3) فاتورة ضريبية (Tax Invoice) لشركة التأمين بقيمة العمولة + ضريبتها.
 *  4) فتح حساب تحليلي للعميل في شجرة الحسابات (مستوى 3).
 * كل ذلك ذرّياً ضمن transaction واحدة.
 */
@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seq: SequenceService,
    private readonly audit: AuditService,
  ) {}

  listVouchers() {
    return this.prisma.voucher.findMany({ orderBy: { createdAt: "desc" } });
  }

  async postings(policyId: string) {
    const [voucher, debitNote, invoice] = await Promise.all([
      this.prisma.voucher.findFirst({ where: { reference: policyId } }),
      this.prisma.debitNote.findFirst({ where: { policyId } }),
      this.prisma.invoice.findFirst({ where: { policyId } }),
    ]);
    return { voucher, debitNote, invoice };
  }

  async approvePolicy(tenantId: string, userId: string, policyId: string) {
    const policy = await this.prisma.policy.findFirst({ where: { id: policyId } });
    if (!policy) throw new NotFoundException("الوثيقة غير موجودة");
    if (policy.status !== "FINANCE_REVIEW") {
      throw new ConflictException("الوثيقة ليست بانتظار الاعتماد المالي (يلزم الموافقة الفنية أولاً)");
    }

    const premium = Number(policy.premium ?? 0);
    const vat = Number(policy.vat ?? 0);
    const total = Number(policy.totalPremium ?? premium + vat);
    const commission = Number(policy.commissionAmount ?? 0);
    const commVat = r2(commission * 0.15);
    const trust = r2(total - commission); // الجزء المحتفظ به أمانةً للمؤمِّن (خارج الميزانية)

    const voucherSeq = await this.seq.nextVoucherSeq("JRV");
    const debitSeq = await this.seq.nextNoteSeq("DN");
    const invoiceSeq = await this.seq.nextInvoiceSeq();

    const result = await this.prisma.$transaction(async (tx) => {
      // 1) قيد يومية (JRV) — مدين = دائن
      const voucher = await tx.voucher.create({
        data: {
          tenantId,
          type: "JRV",
          sequenceNo: voucherSeq,
          amount: total,
          status: "posted",
          isAuto: true,
          reference: policy.id,
          lines: asJson({
            description: `إصدار الوثيقة ${policy.sequenceNo}`,
            entries: [
              { account: "01030000000000000", name: "ذمم العملاء المدينة", debit: total, credit: 0 },
              { account: "02020000000000000", name: "أمانات أقساط العملاء (Off-Balance)", debit: 0, credit: trust },
              { account: "04010000000000000", name: "عمولات الوساطة", debit: 0, credit: commission },
            ],
          }),
        },
      });

      // 2) إشعار مدين للعميل (قسط + ضريبة)
      const debitNote = await tx.debitNote.create({
        data: { tenantId, sequenceNo: debitSeq, clientId: policy.clientId, policyId: policy.id, netAmount: premium, vatAmount: vat },
      });

      // 3) فاتورة ضريبية لشركة التأمين (العمولة + ضريبتها)
      const invoice = await tx.invoice.create({
        data: {
          tenantId,
          sequenceNo: invoiceSeq,
          insurerName: policy.insurerName,
          policyId: policy.id,
          netAmount: commission,
          vatAmount: commVat,
          totalAmount: r2(commission + commVat),
          status: "issued",
        },
      });

      // 4) فتح حساب تحليلي للعميل في COA (مستوى 3 تحت ذمم العملاء 0103) إن لم يوجد
      if (policy.clientId) {
        const existing = await tx.chartOfAccount.findFirst({ where: { clientId: policy.clientId } });
        if (!existing) {
          const parentId = `coa-${tenantId}-01030000000000000`;
          const count = await tx.chartOfAccount.count({ where: { level: 3, parentId } });
          const code = "0103" + String(1001 + count).padStart(13, "0"); // 17 رقماً تحت 0103
          await tx.chartOfAccount.create({
            data: {
              tenantId,
              code,
              name: `حساب العميل ${policy.clientId}`,
              level: 3,
              parentId,
              isOnBalance: true,
              isLocked: false,
              accountType: "asset",
              clientId: policy.clientId,
            },
          });
        }
      }

      // 5) تحديث الحالات ⇒ الوثيقة والطلب ISSUED
      await tx.policy.update({ where: { id: policyId }, data: { status: "ISSUED" } });
      if (policy.requestId) await tx.policyRequest.update({ where: { id: policy.requestId }, data: { status: "ISSUED" } });

      return { voucher: voucher.sequenceNo, debitNote: debitNote.sequenceNo, invoice: invoice.sequenceNo };
    });

    await this.audit.log({ tenantId, userId, action: "approve", entity: "policy_finance", entityId: policyId, meta: result });
    return { policyId, status: "ISSUED", ...result };
  }
}
