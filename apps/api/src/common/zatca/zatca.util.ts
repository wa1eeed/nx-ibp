import { createHash, randomUUID } from "node:crypto";

/**
 * توليد رمز QR لفاتورة ZATCA (المرحلة 1 — Generation) وفق ترميز TLV.
 * خمسة حقول إلزامية: اسم البائع، الرقم الضريبي، الطابع الزمني، الإجمالي شاملاً الضريبة، قيمة الضريبة.
 * كل حقل = [tag][length][value(UTF-8)]، ثم Base64 للسلسلة المجمّعة — هذا هو حِمل الـ QR القابل للمسح.
 */
export interface ZatcaSeller {
  name: string;
  vatNumber: string;
}

export interface ZatcaInvoiceInput {
  sellerName: string;
  vatNumber: string;
  timestamp: string; // ISO 8601
  total: number; // شامل الضريبة
  vat: number;
}

function tlv(tag: number, value: string): Buffer {
  const v = Buffer.from(value, "utf8");
  return Buffer.concat([Buffer.from([tag, v.length]), v]);
}

/** يبني حِمل الـ QR (Base64 TLV) المطابق لمواصفة ZATCA المرحلة 1. */
export function buildZatcaQr(input: ZatcaInvoiceInput): string {
  const fields = [
    tlv(1, input.sellerName),
    tlv(2, input.vatNumber),
    tlv(3, input.timestamp),
    tlv(4, input.total.toFixed(2)),
    tlv(5, input.vat.toFixed(2)),
  ];
  return Buffer.concat(fields).toString("base64");
}

/** يفكّ ترميز TLV (للتحقّق/الاختبار). */
export function decodeZatcaQr(base64: string): Record<number, string> {
  const buf = Buffer.from(base64, "base64");
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

/** بصمة SHA-256 (Base64) لمحتوى الفاتورة — تمهيد لتجزئة المرحلة 2 (Integration). */
export function invoiceHash(canonical: string): string {
  return createHash("sha256").update(canonical, "utf8").digest("base64");
}

/** حزمة ZATCA كاملة لفاتورة: الحِمل، البصمة، ومعرّف فريد (UUID). */
export function zatcaPackage(input: ZatcaInvoiceInput) {
  const qr = buildZatcaQr(input);
  const canonical = `${input.sellerName}|${input.vatNumber}|${input.timestamp}|${input.total.toFixed(2)}|${input.vat.toFixed(2)}`;
  return {
    qr,
    hash: invoiceHash(canonical),
    uuid: randomUUID(),
    fields: input,
  };
}
