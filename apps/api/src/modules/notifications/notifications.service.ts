import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import { RequestContextService } from "../../common/request-context/request-context.service";
import { NOTIFICATION_TYPES, isNotificationKey, notificationDef } from "./notifications.constants";
import { NOTIFICATION_GATEWAY, type NotificationGateway, type OutboundMessage } from "./notification.gateway";
import type { UpdateNotificationDto } from "./dto/notification.dto";

interface EffectiveSetting {
  eventKey: string;
  name: string;
  audience: "client" | "staff"; // جمهور الإشعار (عميل الشركة أو موظفوها)
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
      if (o) return { eventKey: def.key, name: def.name, audience: def.audience, channelEmail: o.channelEmail, channelSms: o.channelSms, subject: o.subject ?? def.subject, body: o.body, source: "custom" as const };
      const p = platform.find((r) => r.eventKey === def.key);
      if (p) return { eventKey: def.key, name: def.name, audience: def.audience, channelEmail: p.channelEmail, channelSms: p.channelSms, subject: p.subject ?? def.subject, body: p.body, source: "inherited" as const };
      return { eventKey: def.key, name: def.name, audience: def.audience, channelEmail: def.email, channelSms: def.sms, subject: def.subject, body: def.body, source: "default" as const };
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

  /** يرسل قائمة رسائل عبر البوّابة (لا يرمي — يسجّل الإخفاقات فقط). يعيد عدد ما أُرسل. */
  private async dispatch(jobs: OutboundMessage[]): Promise<number> {
    let sent = 0;
    for (const j of jobs) {
      try { await this.gateway.send(j); sent += 1; } catch (e) { this.logger.warn(`تعذّر إرسال ${j.channel}: ${(e as Error).message}`); }
    }
    return sent;
  }

  /**
   * إرسال إشعار **لعميل** — يحترم تفعيل القناة ويعبّئ المتغيّرات ثم يرسل عبر البوّابة.
   * (يُستدعى من الموديولز عند الأحداث؛ fire-and-forget عادةً كي لا تُفشِل العملية الأصل.)
   */
  async notify(tenantId: string, eventKey: string, to: { email?: string; phone?: string }, vars: Record<string, string> = {}) {
    const s = await this.resolve(tenantId, eventKey);
    if (!s) return { sent: 0 };
    const body = this.render(s.body, vars);
    const subject = s.subject ? this.render(s.subject, vars) : undefined;
    const jobs: OutboundMessage[] = [];
    if (s.channelEmail && to.email) jobs.push({ channel: "email", to: to.email, subject, body });
    if (s.channelSms && to.phone) jobs.push({ channel: "sms", to: to.phone, body });
    return { sent: await this.dispatch(jobs), channels: jobs.map((j) => j.channel) };
  }

  /**
   * إرسال إشعار **لموظفي الشركة** — يوجَّه لأصحاب صلاحية وحدة الحدث + مالك الحساب (بريد فقط،
   * إذ لا هاتف للمستخدمين). يحترم تفعيل الإعداد على مستوى الشركة/المنصة. fire-and-forget.
   */
  async notifyStaff(tenantId: string, eventKey: string, vars: Record<string, string> = {}) {
    const def = notificationDef(eventKey);
    if (!def || def.audience !== "staff") return { sent: 0 };
    const s = await this.resolve(tenantId, eventKey);
    if (!s || !s.channelEmail) return { sent: 0 }; // إشعارات الموظفين عبر البريد
    const emails = await this.staffRecipients(tenantId, def.module);
    if (!emails.length) return { sent: 0 };
    const body = this.render(s.body, vars);
    const subject = s.subject ? this.render(s.subject, vars) : undefined;
    const jobs: OutboundMessage[] = emails.map((to) => ({ channel: "email" as const, to, subject, body }));
    return { sent: await this.dispatch(jobs), recipients: emails.length };
  }

  /** يعبّئ متغيّرات النص {var}؛ يترك المتغيّر كما هو إن لم تُمرَّر قيمته. */
  private render(t: string, vars: Record<string, string>): string {
    return t.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
  }

  /**
   * مستقبِلو إشعار موظفين لوحدة معيّنة: كل مستخدم نشط له صلاحية الوصول لتلك الوحدة،
   * **بالإضافة إلى مالك الحساب** (أوّل مستخدم أُنشئ) دائمًا. مُزال التكرار بالبريد.
   * يُنفَّذ داخل سياق فارغ ويفلتر بالمستأجر صراحةً (لا يعتمد على سياق الطلب).
   */
  private async staffRecipients(tenantId: string, mod: string | null): Promise<string[]> {
    const users = await this.ctx.run({}, async () =>
      await this.prisma.user.findMany({
        where: { tenantId, status: "ACTIVE" },
        orderBy: { createdAt: "asc" },
        select: { email: true, role: { select: { permissions: { where: { module: mod ?? "__none__", canAccess: true }, select: { id: true } } } } },
      }),
    );
    // مالك الحساب (أوّل مستخدم) دائمًا + كل من له صلاحية الوصول للوحدة
    const chosen = users.filter((u, i) => i === 0 || (u.role?.permissions.length ?? 0) > 0);
    return [...new Set(chosen.map((u) => u.email).filter((e): e is string => !!e))];
  }
}
