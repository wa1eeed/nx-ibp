import { Logger } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import { PAID_STATUSES, type ChargeResult, type CreateChargeInput, type PaymentGateway, type WebhookResult } from "./gateway.types";

/**
 * محوّل بوّابة الدفع Tap (https://developers.tap.company) — Charges API.
 *  - المصادقة: Authorization: Bearer sk_test_… / sk_live_…
 *  - إنشاء شحنة: POST /v2/charges/ ⇒ { id, status, transaction.url }
 *  - استرجاع: GET /v2/charges/{id}
 *  - الـ webhook موقّع بـ hashstring = HMAC-SHA256 على ترتيب حقول x_* بالمفتاح السرّي.
 * نقطة التكامل الحقيقي الوحيدة — لا يُستدعى في الاختبارات (يلزم مفتاح + شبكة).
 */
export class TapGateway implements PaymentGateway {
  readonly name = "tap";
  private readonly logger = new Logger(TapGateway.name);
  private readonly secret: string;
  private readonly base: string;

  /** `secretKey` اختياري: يُمرَّر مفتاح المستأجر لدفع العميل (BYO)؛ وإلا يُقرأ من البيئة (اشتراكات المنصّة). */
  constructor(secretKey?: string) {
    const key = secretKey ?? process.env.TAP_SECRET_KEY;
    if (!key) throw new Error("مفتاح Tap السرّي مطلوب");
    this.secret = key;
    this.base = process.env.TAP_API_URL ?? "https://api.tap.company/v2";
  }

  private async call(method: "POST" | "GET", path: string, body?: unknown): Promise<Record<string, unknown>> {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.secret}`, "Content-Type": "application/json", lang_code: "ar" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      this.logger.error(`Tap ${method} ${path} ⇒ ${res.status}`);
      throw new Error(`Tap API فشل (${res.status})`);
    }
    return json;
  }

  private toResult(json: Record<string, unknown>): ChargeResult {
    const status = String(json.status ?? "UNKNOWN");
    const tx = (json.transaction as { url?: string } | undefined) ?? {};
    return { chargeId: String(json.id ?? ""), status, paid: PAID_STATUSES.has(status), redirectUrl: tx.url ?? null };
  }

  async createCharge(input: CreateChargeInput): Promise<ChargeResult> {
    const json = await this.call("POST", "/charges/", {
      amount: input.amount,
      currency: input.currency,
      description: input.description,
      customer: { first_name: input.customerName, email: input.customerEmail },
      source: { id: "src_all" }, // صفحة Tap المستضافة لكل طرق الدفع (mada/بطاقات/Apple Pay)
      redirect: { url: input.redirectUrl },
      post: { url: input.webhookUrl },
      reference: { transaction: input.reference },
      metadata: input.metadata ?? {},
    });
    return this.toResult(json);
  }

  async retrieveCharge(chargeId: string): Promise<ChargeResult> {
    return this.toResult(await this.call("GET", `/charges/${chargeId}`));
  }

  verifyWebhook(headers: Record<string, string | undefined>, body: Record<string, unknown>): WebhookResult {
    const ref = (body.reference as { gateway?: string; payment?: string } | undefined) ?? {};
    const tx = (body.transaction as { created?: string } | undefined) ?? {};
    const status = String(body.status ?? "");
    // ترتيب الحقول كما تحدّده Tap للتحقّق
    const toHash =
      `x_id${body.id ?? ""}` +
      `x_amount${body.amount ?? ""}` +
      `x_currency${body.currency ?? ""}` +
      `x_gateway_reference${ref.gateway ?? ""}` +
      `x_payment_reference${ref.payment ?? ""}` +
      `x_status${status}` +
      `x_created${tx.created ?? ""}`;
    const expected = createHmac("sha256", this.secret).update(toHash).digest("hex");
    const got = headers["hashstring"] ?? "";
    let valid = false;
    try {
      valid = got.length === expected.length && timingSafeEqual(Buffer.from(got), Buffer.from(expected));
    } catch {
      valid = false;
    }
    return { valid, chargeId: body.id ? String(body.id) : undefined, status, paid: PAID_STATUSES.has(status) };
  }
}
