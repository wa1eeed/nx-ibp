import { Logger } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import { PAID_STATUSES, type ChargeResult, type CreateChargeInput, type PaymentGateway, type WebhookResult } from "./gateway.types";

/**
 * محوّل بوّابة Moyasar (https://moyasar.com) — Payments API.
 *  - المصادقة: Basic (المفتاح السرّي اسم مستخدم، بلا كلمة مرور).
 *  - إنشاء دفعة: POST /v1/payments ⇒ { id, status, source.transaction_url }.
 *  - استرجاع: GET /v1/payments/{id}. الحالة `paid` ⇒ نجاح.
 *  - الـ webhook موقّع بـ HMAC-SHA256 على النصّ الخام بمفتاح الويبهوك.
 * نقطة تكامل حقيقي — لا تُستدعى في الاختبارات (يلزم مفتاح + شبكة).
 */
export class MoyasarGateway implements PaymentGateway {
  readonly name = "moyasar";
  private readonly logger = new Logger(MoyasarGateway.name);
  private readonly secret: string;
  private readonly base: string;

  constructor(secretKey?: string) {
    const key = secretKey ?? process.env.MOYASAR_SECRET_KEY;
    if (!key) throw new Error("مفتاح Moyasar السرّي مطلوب");
    this.secret = key;
    this.base = process.env.MOYASAR_API_URL ?? "https://api.moyasar.com/v1";
  }

  private authHeader(): string {
    return `Basic ${Buffer.from(`${this.secret}:`).toString("base64")}`;
  }

  private async call(method: "POST" | "GET", path: string, body?: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: { Authorization: this.authHeader(), "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      this.logger.error(`Moyasar ${method} ${path} ⇒ ${res.status}`);
      throw new Error(`Moyasar API فشل (${res.status})`);
    }
    return json;
  }

  private toResult(json: Record<string, unknown>): ChargeResult {
    const status = String(json.status ?? "unknown").toUpperCase();
    const source = (json.source as { transaction_url?: string } | undefined) ?? {};
    return { chargeId: String(json.id ?? ""), status, paid: PAID_STATUSES.has(status), redirectUrl: source.transaction_url ?? null };
  }

  async createCharge(input: CreateChargeInput): Promise<ChargeResult> {
    // المبلغ بالهللة (أصغر وحدة)
    const json = await this.call("POST", "/payments", {
      amount: Math.round(input.amount * 100),
      currency: input.currency,
      description: input.description,
      callback_url: input.redirectUrl,
      metadata: { reference: input.reference, ...(input.metadata ?? {}) },
    });
    return this.toResult(json);
  }

  async retrieveCharge(chargeId: string): Promise<ChargeResult> {
    return this.toResult(await this.call("GET", `/payments/${chargeId}`));
  }

  verifyWebhook(headers: Record<string, string | undefined>, body: Record<string, unknown>): WebhookResult {
    const secret = process.env.MOYASAR_WEBHOOK_SECRET ?? this.secret;
    const payment = (body.data as Record<string, unknown> | undefined) ?? body;
    const id = String(payment.id ?? "");
    const status = String(payment.status ?? "").toUpperCase();
    const expected = createHmac("sha256", secret).update(JSON.stringify(body)).digest("hex");
    const got = headers["x-moyasar-signature"] ?? headers["signature"] ?? "";
    let valid = false;
    try { valid = got.length === expected.length && timingSafeEqual(Buffer.from(got), Buffer.from(expected)); } catch { valid = false; }
    return { valid, chargeId: id || undefined, status, paid: PAID_STATUSES.has(status) };
  }
}
