import { Logger } from "@nestjs/common";

export interface OutboundMessage {
  channel: "email" | "sms";
  to: string;
  subject?: string;
  body: string;
}

/** بوّابة إرسال الإشعارات — نقطة تبديل واحدة (Sandbox الآن، مزوّد فعلي لاحقًا:
 *  بريد SES/SMTP · SMS عبر Unifonic/Twilio). تُختار من NOTIFY_GATEWAY. */
export interface NotificationGateway {
  readonly name: string;
  send(msg: OutboundMessage): Promise<{ ok: boolean; id: string }>;
}

export const NOTIFICATION_GATEWAY = Symbol("NOTIFICATION_GATEWAY");

/** بوّابة وهمية — تسجّل الرسائل فقط (تطوير/اختبار). */
export class SandboxNotificationGateway implements NotificationGateway {
  readonly name = "sandbox";
  private readonly logger = new Logger("NotifySandbox");
  private counter = 0;
  async send(msg: OutboundMessage): Promise<{ ok: boolean; id: string }> {
    this.counter += 1;
    this.logger.log(`[${msg.channel}] → ${msg.to} :: ${msg.subject ?? ""} :: ${msg.body.slice(0, 60)}`);
    return { ok: true, id: `sbx-${msg.channel}-${this.counter}` };
  }
}

interface HttpRequest { url: string; init: { method: string; headers: Record<string, string>; body: string } }

/**
 * بوّابة الإنتاج — بلا تبعية (fetch فقط): **SMS عبر Taqnyat** · **Email عبر Resend**.
 * تُفعَّل بـ NOTIFY_GATEWAY=live + المفاتيح. بناء الطلب مفصول (نقيّ) ليُختبَر دون شبكة.
 */
export class LiveNotificationGateway implements NotificationGateway {
  readonly name = "live";
  private readonly logger = new Logger("NotifyLive");

  /** بناء طلب Resend للبريد (https://resend.com — POST /emails). */
  emailRequest(msg: OutboundMessage): HttpRequest {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY مطلوب لإرسال البريد");
    return {
      url: `${process.env.RESEND_API_URL ?? "https://api.resend.com"}/emails`,
      init: {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: process.env.NOTIFY_EMAIL_FROM ?? "IBP <no-reply@example.sa>", to: [msg.to], subject: msg.subject ?? "", text: msg.body }),
      },
    };
  }

  /** بناء طلب Taqnyat للرسائل (https://api.taqnyat.sa — POST /v1/messages). */
  smsRequest(msg: OutboundMessage): HttpRequest {
    const key = process.env.TAQNYAT_API_KEY;
    if (!key) throw new Error("TAQNYAT_API_KEY مطلوب لإرسال SMS");
    return {
      url: `${process.env.TAQNYAT_API_URL ?? "https://api.taqnyat.sa"}/v1/messages`,
      init: {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ recipients: [msg.to], body: msg.body, sender: process.env.TAQNYAT_SENDER ?? "IBP" }),
      },
    };
  }

  async send(msg: OutboundMessage): Promise<{ ok: boolean; id: string }> {
    const req = msg.channel === "email" ? this.emailRequest(msg) : this.smsRequest(msg);
    const res = await fetch(req.url, req.init as Parameters<typeof fetch>[1]);
    const json = (await res.json().catch(() => ({}))) as { id?: string; messageId?: string };
    if (!res.ok) {
      this.logger.error(`فشل إرسال ${msg.channel} (${res.status})`);
      return { ok: false, id: "" };
    }
    return { ok: true, id: String(json.id ?? json.messageId ?? "") };
  }
}
