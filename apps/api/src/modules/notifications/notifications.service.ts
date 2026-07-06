import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import { RequestContextService } from "../../common/request-context/request-context.service";
import { NOTIFICATION_TYPES, isNotificationKey, notificationDef } from "./notifications.constants";
import { NOTIFICATION_GATEWAY, type NotificationGateway, type OutboundMessage } from "./notification.gateway";
import { TenantEmailService } from "../email/tenant-email.service";
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
    private readonly tenantEmail: TenantEmailService,
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

  /**
   * يرسل قائمة رسائل (لا يرمي — يسجّل الإخفاقات فقط). يعيد عدد ما أُرسل.
   * **البريد** يمرّ عبر `sendTenantEmail` (هوية/نطاق المستأجر + fallback مركزي)؛
   * **SMS** عبر البوّابة القابلة للتبديل (Taqnyat/Sandbox).
   */
  private async dispatch(tenantId: string, jobs: OutboundMessage[]): Promise<number> {
    let sent = 0;
    for (const j of jobs) {
      try {
        if (j.channel === "email") {
          const r = await this.tenantEmail.sendTenantEmail(tenantId, j.to, j.subject ?? "", j.body);
          if (r.ok) sent += 1;
        } else {
          await this.gateway.send(j);
          sent += 1;
        }
      } catch (e) {
        this.logger.warn(`تعذّر إرسال ${j.channel}: ${(e as Error).message}`);
      }
    }
    return sent;
  }

  /**
   * إرسال إشعار **لعميل** — يحترم تفعيل القناة، يعبّئ المتغيّرات، يرسل عبر البوّابة (Email/SMS)
   * **ويسجّل نسخة داخل المنصة (in-app)** للعميل ليراها في بوّابته. fire-and-forget عادةً.
   */
  async notify(tenantId: string, eventKey: string, to: { email?: string; phone?: string; clientId?: string }, vars: Record<string, string> = {}) {
    const s = await this.resolve(tenantId, eventKey);
    if (!s) return { sent: 0 };
    const body = this.render(s.body, vars);
    const subject = s.subject ? this.render(s.subject, vars) : undefined;
    const jobs: OutboundMessage[] = [];
    if (s.channelEmail && to.email) jobs.push({ channel: "email", to: to.email, subject, body });
    if (s.channelSms && to.phone) jobs.push({ channel: "sms", to: to.phone, body });
    // نسخة داخل المنصة للعميل (ما دام النوع مُفعَّلًا على أيّ قناة)
    if (to.clientId && (s.channelEmail || s.channelSms)) {
      await this.persistInApp(tenantId, "client", eventKey, subject ?? s.name, body, [{ clientId: to.clientId }]);
    }
    return { sent: await this.dispatch(tenantId, jobs), channels: jobs.map((j) => j.channel) };
  }

  /**
   * إرسال إشعار **لموظفي الشركة** — يوجَّه لأصحاب صلاحية وحدة الحدث + مالك الحساب. يرسل بريدًا
   * (لا هاتف للمستخدمين) **ويسجّل نسخة داخل المنصة (in-app)** لكل مستقبِل. fire-and-forget.
   */
  async notifyStaff(tenantId: string, eventKey: string, vars: Record<string, string> = {}) {
    const def = notificationDef(eventKey);
    if (!def || def.audience !== "staff") return { sent: 0 };
    const s = await this.resolve(tenantId, eventKey);
    if (!s || !s.channelEmail) return { sent: 0 }; // إشعارات الموظفين عبر البريد
    const recipients = await this.staffRecipients(tenantId, def.module);
    if (!recipients.length) return { sent: 0 };
    const body = this.render(s.body, vars);
    const subject = s.subject ? this.render(s.subject, vars) : undefined;
    await this.persistInApp(tenantId, "staff", eventKey, subject ?? s.name, body, recipients.map((r) => ({ userId: r.userId })));
    const jobs: OutboundMessage[] = recipients.map((r) => ({ channel: "email" as const, to: r.email, subject, body }));
    return { sent: await this.dispatch(tenantId, jobs), recipients: recipients.length };
  }

  /**
   * إرسال إشعار **لمستخدم بعينه** (المُسنَد إليه) — يسجّل نسخة داخل المنصة (in-app) ويرسل بريدًا.
   * يُستخدم لإشعارات الإسناد (مهمة/صفقة CRM). fire-and-forget.
   */
  async notifyUser(tenantId: string, userId: string, eventKey: string, vars: Record<string, string> = {}) {
    const s = await this.resolve(tenantId, eventKey);
    if (!s || !s.channelEmail) return { sent: 0 };
    const body = this.render(s.body, vars);
    const subject = s.subject ? this.render(s.subject, vars) : undefined;
    await this.persistInApp(tenantId, "staff", eventKey, subject ?? s.name, body, [{ userId }]);
    const user = await this.ctx.run({}, async () => await this.prisma.user.findFirst({ where: { id: userId, tenantId, status: "ACTIVE" }, select: { email: true } }));
    if (!user?.email) return { sent: 0 };
    return { sent: await this.dispatch(tenantId, [{ channel: "email", to: user.email, subject, body }]) };
  }

  /** يعبّئ متغيّرات النص {var}؛ يترك المتغيّر كما هو إن لم تُمرَّر قيمته. */
  private render(t: string, vars: Record<string, string>): string {
    return t.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
  }

  /** يُنشئ صفوف الإشعارات داخل المنصة (in-app) لكل مستقبِل. لا يرمي. */
  private async persistInApp(
    tenantId: string,
    audience: "client" | "staff",
    eventKey: string,
    title: string,
    body: string,
    recipients: { userId?: string; clientId?: string }[],
  ): Promise<void> {
    if (!recipients.length) return;
    try {
      await this.ctx.run({}, async () =>
        await this.prisma.notification.createMany({
          data: recipients.map((r) => ({ tenantId, userId: r.userId ?? null, clientId: r.clientId ?? null, eventKey, audience, title, body })),
        }),
      );
    } catch (e) {
      this.logger.warn(`تعذّر حفظ إشعار داخل المنصة: ${(e as Error).message}`);
    }
  }

  /**
   * مستقبِلو إشعار موظفين لوحدة معيّنة: كل مستخدم نشط له صلاحية الوصول لتلك الوحدة،
   * **بالإضافة إلى مالك الحساب** (أوّل مستخدم أُنشئ) دائمًا. مُزال التكرار بالمعرّف.
   * يُنفَّذ داخل سياق فارغ ويفلتر بالمستأجر صراحةً (لا يعتمد على سياق الطلب).
   */
  private async staffRecipients(tenantId: string, mod: string | null): Promise<{ userId: string; email: string }[]> {
    const users = await this.ctx.run({}, async () =>
      await this.prisma.user.findMany({
        where: { tenantId, status: "ACTIVE" },
        orderBy: { createdAt: "asc" },
        select: { id: true, email: true, role: { select: { permissions: { where: { module: mod ?? "__none__", canAccess: true }, select: { id: true } } } } },
      }),
    );
    // مالك الحساب (أوّل مستخدم) دائمًا + كل من له صلاحية الوصول للوحدة
    const chosen = users.filter((u, i) => i === 0 || (u.role?.permissions.length ?? 0) > 0);
    const seen = new Set<string>();
    const out: { userId: string; email: string }[] = [];
    for (const u of chosen) {
      if (!u.email || seen.has(u.id)) continue;
      seen.add(u.id);
      out.push({ userId: u.id, email: u.email });
    }
    return out;
  }

  // ————————————————— مركز الإشعارات داخل المنصة (in-app) —————————————————

  /** صندوق إشعارات الموظف الحالي (أحدث أولًا). معزول بالمستأجر (middleware) + المستخدم. */
  inboxStaff(userId: string, limit = 30) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, eventKey: true, title: true, body: true, readAt: true, createdAt: true },
    });
  }

  /** عدد غير المقروء للموظف الحالي. */
  async unreadStaff(userId: string) {
    return { count: await this.prisma.notification.count({ where: { userId, readAt: null } }) };
  }

  /** تعليم إشعار كمقروء (يجب أن يخصّ المستخدم نفسه). */
  async markReadStaff(userId: string, id: string) {
    await this.prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }

  /** تعليم كل إشعارات الموظف كمقروءة. */
  async markAllReadStaff(userId: string) {
    const r = await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
    return { ok: true, updated: r.count };
  }

  /** صندوق إشعارات عميل بوّابة معيّن (أحدث أولًا). */
  inboxClient(clientId: string, limit = 30) {
    return this.prisma.notification.findMany({
      where: { clientId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, eventKey: true, title: true, body: true, readAt: true, createdAt: true },
    });
  }

  async unreadClient(clientId: string) {
    return { count: await this.prisma.notification.count({ where: { clientId, readAt: null } }) };
  }

  async markReadClient(clientId: string, id: string) {
    await this.prisma.notification.updateMany({ where: { id, clientId, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }
}
