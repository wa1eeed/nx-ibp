import { ConflictException, Injectable, UnprocessableEntityException } from "@nestjs/common";
import { Prisma } from "@ibp/db";
import { PrismaService } from "../../../prisma/prisma.service";
import { ZatcaCryptoService, type UblLineItem } from "../../../common/zatca/zatca-crypto.service";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const r2 = (n: number) => +n.toFixed(2);

export interface CreateBillingInput {
  documentType: "TAX_INVOICE" | "DEBIT_NOTE" | "CREDIT_NOTE";
  subtype: "STANDARD_B2B" | "SIMPLIFIED_B2C";
  branch?: string;
  clientId?: string | null;
  policyId?: string | null;
  customer: { name?: string | null; vat?: string | null; crOrId?: string | null; address?: string | null };
  lines: UblLineItem[];
  supplyDate?: string | null;
  billingReferenceId?: string | null;
  reason?: string | null;
}

/**
 * توليد مستندات الفوترة المتوافقة مع ZATCA. كل مستند يحمل:
 * UUIDv4 عالمي + عدّاد وتسلسل وتجزئة معزولة بالمستأجر (سلسلة anti-tampering) + QR (TLV) + UBL.
 * `createInTx` يُستدعى داخل معاملة الاعتماد المالي لضمان الذرّية وعدم تسريب العدّاد بين المستأجرين.
 */
@Injectable()
export class ZatcaBillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly zatca: ZatcaCryptoService,
  ) {}

  private serial(docType: string, counter: number, branch: string, when: Date): string {
    const prefix = docType === "TAX_INVOICE" ? "INV" : docType === "DEBIT_NOTE" ? "DNP" : "CRN";
    return `${prefix}-${branch}-${when.getUTCFullYear()}-${MONTHS[when.getUTCMonth()]}-${10000 + counter}`;
  }

  /** يُنشئ مستند فوترة داخل معاملة. tenantId يُحقن آلياً عبر Prisma middleware (العزل). */
  async createInTx(tx: Prisma.TransactionClient, tenantId: string, input: CreateBillingInput) {
    const cfg = await tx.tenantZatcaConfig.findFirst({ where: { tenantId } });
    if (!cfg) throw new ConflictException("لا توجد تهيئة ZATCA للمستأجر — أكمل التهيئة (Onboarding) أولاً");
    if (!this.zatca.isValidVat(cfg.vatNumber)) {
      throw new UnprocessableEntityException("الرقم الضريبي للمستأجر غير صالح (15 رقماً يبدأ وينتهي بـ 3)");
    }

    const prevHash = cfg.lastDocumentHash;
    // زيادة ذرّية للعدّاد المعزول بالمستأجر
    const bumped = await tx.tenantZatcaConfig.update({ where: { tenantId }, data: { invoiceCounter: { increment: 1 } } });
    const counter = bumped.invoiceCounter;

    const when = new Date();
    const issueTimestamp = when.toISOString();
    const issueDate = issueTimestamp.slice(0, 10);
    const serialNumber = this.serial(input.documentType, counter, input.branch ?? "RUH", when);
    const uuid = this.zatca.uuidV4();

    const totalExclVat = r2(input.lines.reduce((s, l) => s + l.net, 0));
    const totalVat = r2(input.lines.reduce((s, l) => s + l.vatAmount, 0));
    const totalInclVat = r2(totalExclVat + totalVat);

    const ublInput = {
      uuid, serialNumber, documentType: input.documentType, issueDate, issueTimestamp,
      supplyDate: input.supplyDate ?? null,
      supplier: { name: cfg.businessNameAr, vat: cfg.vatNumber },
      customer: input.customer,
      lines: input.lines, totalExclVat, totalVat, totalInclVat,
      previousHash: prevHash, billingReferenceId: input.billingReferenceId ?? null, reason: input.reason ?? null,
    };
    const hash = this.zatca.hashDocument(this.zatca.canonical(ublInput), prevHash);
    const qrTlv = this.zatca.buildQr({ sellerName: cfg.businessNameAr, vatNumber: cfg.vatNumber, timestamp: issueTimestamp, total: totalInclVat, vat: totalVat, xmlHash: hash });
    const xmlPayload = this.zatca.buildUbl(ublInput) as Prisma.InputJsonValue;

    const doc = await tx.billingDocument.create({
      data: {
        tenantId, uuid, documentType: input.documentType as never, invoiceSubtype: input.subtype as never,
        serialNumber, counter, previousHash: prevHash, hash, qrTlv, xmlPayload,
        issueDate, issueTimestamp, supplyDate: input.supplyDate ?? null,
        supplierName: cfg.businessNameAr, supplierVat: cfg.vatNumber,
        customerName: input.customer.name ?? null, customerVat: input.customer.vat ?? null,
        customerCrOrId: input.customer.crOrId ?? null, customerAddress: input.customer.address ?? null,
        clientId: input.clientId ?? null, policyId: input.policyId ?? null,
        lineItems: input.lines as unknown as Prisma.InputJsonValue,
        totalExclVat, totalVat, totalInclVat,
        billingReferenceId: input.billingReferenceId ?? null, reasonForIssuance: input.reason ?? null,
        zatcaFlow: input.subtype === "SIMPLIFIED_B2C" ? "REPORTING" : "CLEARANCE",
        zatcaStatus: "PENDING",
      },
    });
    // ربط سلسلة التجزئة: آخر تجزئة للمستأجر = تجزئة هذا المستند
    await tx.tenantZatcaConfig.update({ where: { tenantId }, data: { lastDocumentHash: hash } });
    return doc;
  }

  list(tenantId: string) {
    return this.prisma.billingDocument.findMany({
      where: { tenantId },
      orderBy: { counter: "desc" },
      select: {
        id: true, uuid: true, documentType: true, invoiceSubtype: true, serialNumber: true, counter: true,
        totalInclVat: true, totalVat: true, issueDate: true, qrTlv: true, hash: true, previousHash: true,
        zatcaFlow: true, zatcaStatus: true, customerName: true, clientId: true, policyId: true,
      },
    });
  }
}
