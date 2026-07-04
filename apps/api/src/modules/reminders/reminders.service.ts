import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../../prisma/prisma.service";
import { RequestContextService } from "../../common/request-context/request-context.service";
import { NotificationsService } from "../notifications/notifications.service";

/**
 * مجدول التذكيرات الدورية (cron داخلي عبر @nestjs/schedule).
 *
 * يمسح المستأجرين — افتراضيًا الجميع (المسح اليومي)، أو مستأجرًا واحدًا (التشغيل اليدوي) —
 * ويطلق تذكيرين بلا تكرار (idempotent):
 *   1) **مهام CRM المستحقّة**: `dueDate ≤ اليوم`، مفتوحة، لم تُذكَّر ⇒ إشعار المُسنَد إليه (`staff_task_due`).
 *   2) **الوثائق المقتربة من الانتهاء**: مُصدَرة، `endDate` خلال نافذة التجديد، لم تُذكَّر ⇒
 *      إشعار فريق التجديدات (`staff_renewal_due`) + تذكير العميل (`renewal_reminder`).
 *
 * الحتمية: كل عنصر يُوسَم بعد الإشعار (`reminderSentAt`/`renewalRemindedAt`) فلا يتكرّر تذكيره.
 * العزل: المسح خارج سياق الطلب، فالاستعلامات تُلَفّ بـ `ctx.run({})` لتعبر المستأجرين (بلا فرض tenantId)،
 * ومع ذلك كل تذكير يُوجَّه بمعرّف مستأجره الصريح إلى دوال الإشعار المعزولة.
 */
@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);
  /** نافذة التذكير بالتجديد — أيام قبل انتهاء الوثيقة. */
  private static readonly RENEWAL_WINDOW_DAYS = 30;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContextService,
    private readonly notifications: NotificationsService,
  ) {}

  /** المسح اليومي — كل المستأجرين. الوقت الفعلي (بيئة تشغيل، لا اختبار). */
  @Cron(CronExpression.EVERY_DAY_AT_8AM, { name: "reminders-daily" })
  async runDaily(): Promise<void> {
    const r = await this.sweep(new Date());
    this.logger.log(`تذكيرات يومية: ${r.tasks} مهمّة مستحقّة · ${r.renewals} وثيقة للتجديد`);
  }

  /**
   * المسح الفعلي — قابل للاستدعاء يدويًا (نقطة نهاية إدارية + اختبار).
   * @param now الزمن المرجعي (يُمرَّر صراحةً للحتمية والاختبار).
   * @param tenantId إن حُدِّد، يُقصَر المسح على مستأجر واحد (التشغيل اليدوي من داخل الشركة).
   */
  async sweep(now: Date, tenantId?: string): Promise<{ tasks: number; renewals: number }> {
    return this.ctx.run({}, async () => {
      const tasks = await this.remindDueTasks(now, tenantId);
      const renewals = await this.remindDueRenewals(now, tenantId);
      return { tasks, renewals };
    });
  }

  /** مهام CRM بلغت الاستحقاق ولم تُذكَّر ⇒ إشعار المُسنَد إليه. */
  private async remindDueTasks(now: Date, tenantId?: string): Promise<number> {
    const due = await this.prisma.crmTask.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        status: "open",
        dueDate: { lte: now },
        reminderSentAt: null,
        assigneeId: { not: null },
      },
      select: { id: true, tenantId: true, title: true, assigneeId: true, dueDate: true },
    });
    for (const t of due) {
      await this.notifications
        .notifyUser(t.tenantId, t.assigneeId as string, "staff_task_due", {
          title: t.title,
          dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : "",
        })
        .catch((e: unknown) => this.logger.warn(`تعذّر إشعار مهمّة ${t.id}: ${String(e)}`));
      await this.prisma.crmTask.update({ where: { id: t.id }, data: { reminderSentAt: now } });
    }
    return due.length;
  }

  /** وثائق مُصدَرة تقترب من الانتهاء ولم تُذكَّر ⇒ إشعار فريق التجديدات + تذكير العميل. */
  private async remindDueRenewals(now: Date, tenantId?: string): Promise<number> {
    const horizon = new Date(now.getTime() + RemindersService.RENEWAL_WINDOW_DAYS * 86_400_000);
    const due = await this.prisma.policy.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        status: "ISSUED",
        endDate: { gte: now, lte: horizon },
        renewalRemindedAt: null,
      },
      select: { id: true, tenantId: true, sequenceNo: true, clientId: true },
    });
    for (const p of due) {
      const ref = p.sequenceNo ?? p.id;
      await this.notifications
        .notifyStaff(p.tenantId, "staff_renewal_due", { ref })
        .catch((e: unknown) => this.logger.warn(`تعذّر إشعار تجديد ${p.id}: ${String(e)}`));
      if (p.clientId) {
        const client = await this.prisma.client.findFirst({
          where: { id: p.clientId, tenantId: p.tenantId },
          select: { email: true, phone: true },
        });
        if (client) {
          await this.notifications
            .notify(
              p.tenantId,
              "renewal_reminder",
              { email: client.email ?? undefined, phone: client.phone ?? undefined, clientId: p.clientId },
              { ref },
            )
            .catch((e: unknown) => this.logger.warn(`تعذّر تذكير عميل التجديد ${p.id}: ${String(e)}`));
        }
      }
      await this.prisma.policy.update({ where: { id: p.id }, data: { renewalRemindedAt: now } });
    }
    return due.length;
  }
}
