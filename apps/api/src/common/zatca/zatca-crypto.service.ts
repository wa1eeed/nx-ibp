import { Injectable } from "@nestjs/common";
import { createHash, generateKeyPairSync, randomUUID } from "node:crypto";

export interface QrTags {
  sellerName: string;
  vatNumber: string;
  timestamp: string; // ISO 8601
  total: number; // شامل الضريبة
  vat: number;
  xmlHash?: string; // Tag 6 — المرحلة 2
  signature?: string; // Tag 7 — المرحلة 2 (ECDSA)
}

export interface UblLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  vatRate: number;
  vatAmount: number;
  net: number;
}

export interface UblInput {
  uuid: string;
  serialNumber: string;
  documentType: string;
  issueDate: string;
  issueTimestamp: string;
  supplyDate?: string | null;
  supplier: { name: string; vat: string };
  customer: { name?: string | null; vat?: string | null; crOrId?: string | null; address?: string | null };
  lines: UblLineItem[];
  totalExclVat: number;
  totalVat: number;
  totalInclVat: number;
  previousHash?: string | null;
  billingReferenceId?: string | null;
  reason?: string | null;
}

/**
 * خدمة التشفير المركزية لـ ZATCA (Fatoora) — لا حالة، قابلة لإعادة الاستخدام.
 * - التحقّق من الرقم الضريبي · توليد مفتاح EGS و CSR (ECDSA secp256k1)
 * - ترميز QR بـ TLV (الوسوم 1–7) · سلسلة تجزئة SHA-256 · UUIDv4 · بنية UBL 2.1
 */
@Injectable()
export class ZatcaCryptoService {
  /** رقم ضريبي سعودي صالح: 15 رقماً يبدأ وينتهي بـ 3. */
  isValidVat(vat: string): boolean {
    return /^3\d{13}3$/.test(vat);
  }

  uuidV4(): string {
    return randomUUID();
  }

  /**
   * يولّد زوج مفاتيح ECDSA secp256k1 (حقيقي) + CSR.
   * المفتاح حقيقي ويُشفَّر at-rest. الـ CSR بنية Sandbox تحمل بيانات المنشأة —
   * يُستبدَل ببناء PKCS#10 الرسمي لـ ZATCA في الإنتاج (المرحلة 9).
   */
  generateEgsKeyAndCsr(input: { vatNumber: string; businessName: string; crNumber?: string | null; egsSerial: string }) {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "secp256k1" });
    const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
    const subject = {
      CN: input.businessName,
      organizationIdentifier: input.vatNumber,
      serialNumber: input.egsSerial,
      cr: input.crNumber ?? null,
      title: "1100", // نوع الفاتورة (B2B/B2C)
      registeredAddress: "Riyadh, KSA",
    };
    const csrBody = Buffer.from(JSON.stringify({ subject, publicKeyPem }), "utf8").toString("base64");
    const csrPem = `-----BEGIN CERTIFICATE REQUEST-----\n${csrBody.match(/.{1,64}/g)!.join("\n")}\n-----END CERTIFICATE REQUEST-----`;
    return { privateKeyPem, publicKeyPem, csrPem };
  }

  /** عنصر TLV واحد: [tag][length][value(UTF-8)]. */
  private tlv(tag: number, value: string): Buffer {
    const v = Buffer.from(value, "utf8");
    return Buffer.concat([Buffer.from([tag, v.length]), v]);
  }

  /** حِمل QR بترميز TLV (Base64) — الوسوم 1–5 إلزامية، 6/7 للمرحلة 2 (Integration). */
  buildQr(t: QrTags): string {
    const parts = [
      this.tlv(1, t.sellerName),
      this.tlv(2, t.vatNumber),
      this.tlv(3, t.timestamp),
      this.tlv(4, t.total.toFixed(2)),
      this.tlv(5, t.vat.toFixed(2)),
    ];
    if (t.xmlHash) parts.push(this.tlv(6, t.xmlHash));
    if (t.signature) parts.push(this.tlv(7, t.signature));
    return Buffer.concat(parts).toString("base64");
  }

  /** فكّ ترميز TLV (للتحقّق/الاختبار). */
  decodeQr(b64: string): Record<number, string> {
    const buf = Buffer.from(b64, "base64");
    const out: Record<number, string> = {};
    let i = 0;
    while (i < buf.length) {
      const tag = buf[i];
      const len = buf[i + 1];
      out[tag] = buf.subarray(i + 2, i + 2 + len).toString("utf8");
      i += 2 + len;
    }
    return out;
  }

  /** تجزئة المستند SHA-256 (Base64) مُسلسَلة مع تجزئة المستند السابق (anti-tampering). */
  hashDocument(canonical: string, previousHash?: string | null): string {
    return createHash("sha256")
      .update((previousHash ?? "0") + "|" + canonical, "utf8")
      .digest("base64");
  }

  /** السلسلة المعيارية المُجزَّأة (حقول جوهرية ثابتة الترتيب). */
  canonical(u: UblInput): string {
    return [u.uuid, u.serialNumber, u.documentType, u.issueTimestamp, u.supplier.vat, u.totalInclVat.toFixed(2), u.totalVat.toFixed(2)].join("|");
  }

  /** بنية JSON تُحاكي UBL 2.1 (للتسلسل إلى XML في المرحلة 9). */
  buildUbl(u: UblInput): Record<string, unknown> {
    return {
      "cbc:ProfileID": "reporting:1.0",
      "cbc:ID": u.serialNumber,
      "cbc:UUID": u.uuid,
      "cbc:IssueDate": u.issueDate,
      "cbc:IssueTime": u.issueTimestamp,
      "cbc:InvoiceTypeCode": u.documentType,
      ...(u.supplyDate ? { "cac:Delivery": { "cbc:ActualDeliveryDate": u.supplyDate } } : {}),
      ...(u.billingReferenceId ? { "cac:BillingReference": { "cbc:ID": u.billingReferenceId, reason: u.reason } } : {}),
      "cac:AccountingSupplierParty": { "cbc:RegistrationName": u.supplier.name, "cbc:CompanyID": u.supplier.vat },
      "cac:AccountingCustomerParty": {
        "cbc:RegistrationName": u.customer.name ?? "",
        "cbc:CompanyID": u.customer.vat ?? "",
        idOrCr: u.customer.crOrId ?? "",
        address: u.customer.address ?? "",
      },
      "cac:InvoiceLine": u.lines.map((l, i) => ({
        "cbc:ID": i + 1,
        "cbc:InvoicedQuantity": l.quantity,
        "cbc:LineExtensionAmount": l.net,
        "cac:Item": { "cbc:Name": l.description },
        "cac:Price": { "cbc:PriceAmount": l.unitPrice },
        "cac:TaxTotal": { "cbc:TaxAmount": l.vatAmount, "cbc:Percent": l.vatRate },
        ...(l.discount ? { "cac:AllowanceCharge": { "cbc:Amount": l.discount } } : {}),
      })),
      "cac:TaxTotal": { "cbc:TaxAmount": u.totalVat },
      "cac:LegalMonetaryTotal": {
        "cbc:TaxExclusiveAmount": u.totalExclVat,
        "cbc:TaxInclusiveAmount": u.totalInclVat,
        "cbc:PayableAmount": u.totalInclVat,
      },
    };
  }
}
