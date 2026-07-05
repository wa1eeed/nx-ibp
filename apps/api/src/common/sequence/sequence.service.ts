import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * مولّد أرقام تسلسلية مبدئي (لكل مستأجر — العدّ مفلتر تلقائياً).
 * يكتمل في المرحلة 4 بجدول تسلسلات وفروع وفئات (POL-RUH-MED-2026-1001).
 */
@Injectable()
export class SequenceService {
  constructor(private readonly prisma: PrismaService) {}

  private year(): number {
    return new Date().getFullYear();
  }

  /** كود عميل تجاري مقروء: CLI-2026-1001 */
  async nextClientCode(): Promise<string> {
    const count = await this.prisma.client.count();
    return `CLI-${this.year()}-${1001 + count}`;
  }

  /** رقم طلب: SL-MED-2026-1001 (فئة المنتج + السنة + تسلسل) */
  async nextRequestSeq(classCode: string): Promise<string> {
    const count = await this.prisma.policyRequest.count();
    return `SL-${classCode}-${this.year()}-${1001 + count}`;
  }

  /** رقم طلب أسعار: RFQ-MED-2026-1001 */
  async nextSlipSeq(classCode: string): Promise<string> {
    const count = await this.prisma.slip.count();
    return `RFQ-${classCode}-${this.year()}-${1001 + count}`;
  }

  /** رقم وثيقة بالفرع: POL-RUH-MED-2026-1001 */
  async nextPolicySeq(branchCode: string, classCode: string): Promise<string> {
    const count = await this.prisma.policy.count();
    return `POL-${branchCode}-${classCode}-${this.year()}-${1001 + count}`;
  }

  /** رقم سند بنوعه: JRV-2026-1001 */
  async nextVoucherSeq(type: string): Promise<string> {
    const count = await this.prisma.voucher.count();
    return `${type}-${this.year()}-${1001 + count}`;
  }

  /** رقم فاتورة ضريبية: INV-2026-1001 */
  async nextInvoiceSeq(): Promise<string> {
    const count = await this.prisma.invoice.count();
    return `INV-${this.year()}-${1001 + count}`;
  }

  /** رقم إشعار مدين/دائن: DN/CN/CNC-2026-1001 (CNC = إشعار دائن على المؤمِّن) */
  async nextNoteSeq(prefix: "DN" | "CN" | "CNC"): Promise<string> {
    const count = prefix === "DN" ? await this.prisma.debitNote.count() : await this.prisma.creditNote.count();
    return `${prefix}-${this.year()}-${1001 + count}`;
  }

  /** رقم طلب خدمة: RQ-2026-1001 */
  async nextServiceSeq(): Promise<string> {
    const count = await this.prisma.serviceRequest.count();
    return `RQ-${this.year()}-${1001 + count}`;
  }

  /** رقم مطالبة: CL-2026-1001 */
  async nextClaimSeq(): Promise<string> {
    const count = await this.prisma.claim.count();
    return `CL-${this.year()}-${1001 + count}`;
  }

  /** رمز منتِج: PRD-1001 */
  async nextProducerSeq(): Promise<string> {
    const count = await this.prisma.producer.count();
    return `PRD-${1001 + count}`;
  }
}

