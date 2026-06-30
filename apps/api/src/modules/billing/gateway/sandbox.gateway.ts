import { createHmac, timingSafeEqual } from "node:crypto";
import { PAID_STATUSES, type ChargeResult, type CreateChargeInput, type PaymentGateway, type WebhookResult } from "./gateway.types";

/**
 * بوّابة وهمية للتطوير/الاختبار — بلا شبكة. تُنشئ شحنة «تنجح» عند الاسترجاع،
 * وتوقّع الـ webhook بـ HMAC مبسّط (id|status) بمفتاح BILLING_WEBHOOK_SECRET.
 */
export class SandboxGateway implements PaymentGateway {
  readonly name = "sandbox";
  private get secret(): string {
    return process.env.BILLING_WEBHOOK_SECRET ?? "sandbox_secret";
  }

  async createCharge(input: CreateChargeInput): Promise<ChargeResult> {
    // معرّف حتميّ من المرجع + إعادة رابط العودة (صفحة الواجهة) كصفحة دفع وهمية
    return { chargeId: `sbx_${input.reference}`, status: "INITIATED", paid: false, redirectUrl: `${input.redirectUrl}${input.redirectUrl.includes("?") ? "&" : "?"}sandbox=1` };
  }

  async retrieveCharge(chargeId: string): Promise<ChargeResult> {
    // التطوير: الشحنة تُعدّ مدفوعة دائمًا عند الاسترجاع (محاكاة إتمام العميل)
    return { chargeId, status: "CAPTURED", paid: true, redirectUrl: null };
  }

  /** توقيع الـ webhook الوهمي للاختبار. */
  sign(id: string, status: string): string {
    return createHmac("sha256", this.secret).update(`${id}|${status}`).digest("hex");
  }

  verifyWebhook(headers: Record<string, string | undefined>, body: Record<string, unknown>): WebhookResult {
    const id = String(body.id ?? "");
    const status = String(body.status ?? "");
    const expected = this.sign(id, status);
    const got = headers["hashstring"] ?? "";
    let valid = false;
    try {
      valid = got.length === expected.length && timingSafeEqual(Buffer.from(got), Buffer.from(expected));
    } catch {
      valid = false;
    }
    return { valid, chargeId: id || undefined, status, paid: PAID_STATUSES.has(status) };
  }
}
