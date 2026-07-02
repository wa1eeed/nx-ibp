import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import { RequestContextService } from "../../common/request-context/request-context.service";
import { NOTIFICATION_TYPES, isNotificationKey } from "./notifications.constants";
import { NOTIFICATION_GATEWAY, type NotificationGateway, type OutboundMessage } from "./notification.gateway";
import type { UpdateNotificationDto } from "./dto/notification.dto";

interface EffectiveSetting {
  eventKey: string;
  name: string;
  channelEmail: boolean;
  channelSms: boolean;
  subject: string | null;
  body: string;
  source: "custom" | "inherited" | "default"; // مخصّص | موروث من المنصة | افتراضي نظام
}

/**
 * إعدادات الإشعارات (المرحلة H). مستويان: افتراضي المنصة (tenantId=null)
 * وتخصيص الشركة (tenantId). resolve: تخصيص الشركة ← افتراضي المنصة ← افتراضي النظام.
 * الإرسال عبر بوّابة قابلة للتبديل (Sandbox الآن).
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ctx: RequestContextService,
    @Inject(NOTIFICATION_GATEWAY) private readonly gateway: NotificationGateway,
  ) {}

  /** صفوف الإعداد لنطاق معيّن. نُنهي الاستعلام **داخل** السياق الفارغ (PrismaPromise
   *  كسول — يُنفَّذ عند await، فيجب أن يقع await داخل ctx.run كي يُتخطّى الفرض). */
  private rows(tenantId: string | null) {
    return this.ctx.run({}, async () => await this.prisma.notificationSetting.findMany({ where: { tenantId } }));
  }

  /** قائمة الإعدادات الفعّالة لكل الأنواع لنطاق معيّن (null = المنصة). */
  async list(tenantId: string | null): Promise<EffectiveSetting[]> {
    const own = await this.rows(tenantId);
    const platform = tenantId ? await this.rows(null) : [];
    return NOTIFICATION_TYPES.map((def) => {
      const o = own.find((r) => r.eventKey === def.key);
      if (o) return { eventKey: def.key, name: def.name, channelEmail: o.channelEmail, channelSms: o.channelSms, subject: o.subject ?? def.subject, body: o.body, source: "custom" as const };
      const p = platform.find((r) => r.eventKey === def.key);
      if (p) return { eventKey: def.key, name: def.name, channelEmail: p.channelEmail, channelSms: p.channelSms, subject: p.subject ?? def.subject, body: p.body, source: "inherited" as const };
      return { eventKey: def.key, name: def.name, channelEmail: def.email, channelSms: def.sms, subject: def.subject, body: def.body, source: "default" as const };
    });
  }

  /** حفظ/تحديث إعداد لنوع (upsert يدوي — قد يوجد صفّان null بلا قيد فريد). */
  async update(tenantId: string | null, actorId: string, eventKey: string, dto: UpdateNotificationDto) {
    if (!isNotificationKey(eventKey)) throw new BadRequestException("نوع إشعار غير معروف");
    await this.ctx.run({}, async () => {
      const existing = await this.prisma.notificationSetting.findFirst({ where: { tenantId, eventKey }, select: { id: true } });
      const data = { channelEmail: dto.channelEmail, channelSms: dto.channelSms, subject: dto.subject ?? null, body: dto.body };
      if (existing) await this.prisma.notificationSetting.update({ where: { id: existing.id }, data });
      else await this.prisma.notificationSetting.create({ data: { tenantId, eventKey, ...data } });
    });
    await this.audit.log({ tenantId: tenantId ?? "platform", userId: actorId, action: "update", entity: "notification_setting", entityId: eventKey, meta: { scope: tenantId ? "tenant" : "platform" } });
    return { ok: true };
  }

  /** الإعداد الفعّال لنوع (للإرسال). */
  private async resolve(tenantId: string, eventKey: string) {
    return (await this.list(tenantId)).find((s) => s.eventKey === eventKey) ?? null;
  }

  /**
   * إرسال إشعار لحدث — يحترم تفعيل القناة ويعبّئ المتغيّرات ثم يرسل عبر البوّابة.
   * (يُستدعى من الموديولز عند الأحداث؛ الإرسال الفعلي عبر مزوّد لاحقًا.)
   */
  async notify(tenantId: string, eventKey: string, to: { email?: string; phone?: string }, vars: Record<string, string> = {}) {
    const s = await this.resolve(tenantId, eventKey);
    if (!s) return { sent: 0 };
    const render = (t: string) => t.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
    const body = render(s.body);
    const subject = s.subject ? render(s.subject) : undefined;
    const jobs: OutboundMessage[] = [];
    if (s.channelEmail && to.email) jobs.push({ channel: "email", to: to.email, subject, body });
    if (s.channelSms && to.phone) jobs.push({ channel: "sms", to: to.phone, body });
    let sent = 0;
    for (const j of jobs) {
      try { await this.gateway.send(j); sent += 1; } catch (e) { this.logger.warn(`تعذّر إرسال ${j.channel}: ${(e as Error).message}`); }
    }
    return { sent, channels: jobs.map((j) => j.channel) };
  }
}
