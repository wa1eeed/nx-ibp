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
