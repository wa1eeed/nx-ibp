/** عقد بوّابة الدفع — نقطة تبديل واحدة (Tap الآن، أي مزوّد لاحقًا). */

export interface CreateChargeInput {
  amount: number;
  currency: string;
  description: string;
  customerName: string;
  customerEmail: string;
  redirectUrl: string; // يعود العميل إليه بعد الدفع (الواجهة)
  webhookUrl: string; // تُبلّغ البوّابة النتيجة هنا (الـ API)
  reference: string; // مرجعنا الداخلي (معرّف الفاتورة)
  metadata?: Record<string, string>;
}

export interface ChargeResult {
  chargeId: string;
  status: string; // حالة البوّابة الخام (INITIATED/CAPTURED/FAILED…)
  paid: boolean; // اشتُقّت: CAPTURED ⇒ true
  redirectUrl: string | null; // رابط صفحة الدفع المستضافة
}

export interface WebhookResult {
  valid: boolean; // صحّة التوقيع (hashstring)
  chargeId?: string;
  status?: string;
  paid: boolean;
}

export interface PaymentGateway {
  readonly name: string;
  createCharge(input: CreateChargeInput): Promise<ChargeResult>;
  retrieveCharge(chargeId: string): Promise<ChargeResult>;
  verifyWebhook(headers: Record<string, string | undefined>, body: Record<string, unknown>): WebhookResult;
}

/** رمز حقن بوّابة الدفع. */
export const PAYMENT_GATEWAY = Symbol("PAYMENT_GATEWAY");

/** حالات تُعدّ نجاحًا (دفع مكتمل). */
export const PAID_STATUSES = new Set(["CAPTURED", "PAID"]);
