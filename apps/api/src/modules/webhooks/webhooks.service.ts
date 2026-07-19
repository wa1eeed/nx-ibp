import { Injectable, Logger } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { CarrierEventDto } from "./dto/carrier-event.dto";

/**
 * تسلسل JSON حتميّ (مفاتيح مرتّبة، تعاود على العمق، **يتجاهل القيم undefined**) —
 * لتوقيع/تحقّق متطابق عبر الطرفين بصرف النظر عن ترتيب المفاتيح أو الحقول الاختيارية غير المُرسَلة.
 */
export function canonicalJson(v: unknown): string {
  if (v === null || v === undefined || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
}

/**
 * مستقبِل موحّد لأحداث المؤمِّنين اللاتزامنية (Carrier Webhooks) — بمصادقة توقيع.
 * التوقيع: HMAC-SHA256 للحمولة بسرّ المؤمِّن (`x-carrier-signature: sha256=<hex>`).
 * السرّ من البيئة لكل مؤمِّن (`CARRIER_WEBHOOK_SECRET_<CARRIER>`) أو سرّ عام — لا أسرار في الكود.
 *
 * ملاحظة إنتاج: للتحقّق البايتي الدقيق يُستخدم **الجسم الخام** (كما في مسار رفع المستندات)؛
 * هنا (placeholder) نتحقّق على الحمولة المُطبَّعة (JSON) — يكفي لإطار التكامل، ويُشدَّد عند الربط الفعلي.
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  /** يتحقّق من توقيع الحدث مقابل سرّ المؤمِّن (fail-closed: بلا سرّ/توقيع ⇒ رفض). */
  verifySignature(carrier: string, signature: string | undefined, payload: unknown): boolean {
    const secret =
      process.env[`CARRIER_WEBHOOK_SECRET_${carrier.toUpperCase()}`] || process.env.CARRIER_WEBHOOK_SECRET;
    if (!secret || !signature) return false;
    const expected = createHmac("sha256", secret).update(canonicalJson(payload)).digest("hex");
    const provided = signature.replace(/^sha256=/i, "").trim();
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(provided, "utf8");
    return a.length === b.length && timingSafeEqual(a, b); // مقارنة ثابتة الزمن (منع timing attack)
  }

  /**
   * يعالج حدث المؤمِّن (stub قابل للتوسّع): يُسجّل الحدث ويعيد استجابة idempotent.
   * الإنتاج: يُخطِّط `data` ⇒ تحديث الوثيقة/الملحق/الحالة داخليًا (يحلّ المستأجر من `policyRef`).
   */
  async handleCarrierEvent(carrier: string, dto: CarrierEventDto): Promise<{ ok: true; received: string }> {
    this.logger.log(`carrier webhook · ${carrier} · ${dto.eventType} · ref=${dto.policyRef ?? "-"} · id=${dto.eventId}`);
    // TODO(production): مطابقة eventId لمنع التكرار + تخطيط الحمولة ⇒ تحديث الكيان الداخلي عبر خدمة مخصّصة.
    return { ok: true, received: dto.eventId };
  }
}
