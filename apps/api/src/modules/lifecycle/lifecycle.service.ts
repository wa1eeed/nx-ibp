import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { auditPhase, describeAudit } from "../../common/audit/audit-describe";

export interface TimelineEvent {
  at: Date;
  actor: string; // اسم الموظف المنفِّذ (أو «النظام» للعمليات الآلية)
  phase: string; // crm | request | underwriting | issuance | finance | service | other
  action: string; // create | update | approve | …
  label: string; // وصف عربي للإجراء
}

/**
 * سجلّ رحلة الكيان الموحّد (Lifecycle Journey): يتتبّع الوثيقة/الطلب عبر كامل مساره —
 * من أول إجراء (فرصة CRM) ⇐ الطلب ⇐ التسعير/العروض ⇐ الإصدار ⇐ المالية —
 * مجمّعًا من `AuditLog` (كل إجراء بمنفِّذه ووقته) و`CrmActivity` (سرد طور العلاقات).
 * كل حدث: الوقت الدقيق + اسم الموظف + وصف الإجراء + الطور.
 */
@Injectable()
export class LifecycleService {
  constructor(private readonly prisma: PrismaService) {}

  async forPolicy(id: string): Promise<{ events: TimelineEvent[] }> {
    const policy = await this.prisma.policy.findFirst({ where: { id }, select: { id: true, requestId: true } });
    if (!policy) throw new NotFoundException("الوثيقة غير موجودة");
    return this.assemble({ policyId: id, requestId: policy.requestId });
  }

  async forRequest(id: string): Promise<{ events: TimelineEvent[] }> {
    const req = await this.prisma.policyRequest.findFirst({ where: { id }, select: { id: true } });
    if (!req) throw new NotFoundException("الطلب غير موجود");
    const policy = await this.prisma.policy.findFirst({ where: { requestId: id }, orderBy: { createdAt: "asc" }, select: { id: true } });
    return this.assemble({ policyId: policy?.id ?? null, requestId: id });
  }

  /** يجمع معرّفات كل الكيانات المرتبطة بالرحلة ثم يبني الخطّ الزمني منها. */
  private async assemble({ policyId, requestId }: { policyId: string | null; requestId: string | null }): Promise<{ events: TimelineEvent[] }> {
    const ids = new Set<string>();
    if (policyId) ids.add(policyId);
    if (requestId) ids.add(requestId);
    let dealId: string | null = null;

    if (requestId) {
      const [deal, slips] = await Promise.all([
        this.prisma.deal.findFirst({ where: { requestId }, select: { id: true } }),
        this.prisma.slip.findMany({ where: { requestId }, select: { id: true } }),
      ]);
      dealId = deal?.id ?? null;
      if (dealId) ids.add(dealId);
      const slipIds = slips.map((s) => s.id);
      slipIds.forEach((s) => ids.add(s));
      if (slipIds.length) {
        const quotations = await this.prisma.quotation.findMany({ where: { slipId: { in: slipIds } }, select: { id: true } });
        quotations.forEach((q) => ids.add(q.id));
      }
    }
    if (policyId) {
      // كل ما يتعلّق بالوثيقة بعد الإصدار: ملاحق · مطالبات · فواتير/إشعارات مدينة ودائنة · سندات قبض
      const [endorsements, claims, invoices, debitNotes, creditNotes] = await Promise.all([
        this.prisma.endorsement.findMany({ where: { policyId }, select: { id: true } }),
        this.prisma.claim.findMany({ where: { policyId }, select: { id: true } }),
        this.prisma.invoice.findMany({ where: { policyId }, select: { id: true } }),
        this.prisma.debitNote.findMany({ where: { policyId }, select: { id: true } }),
        this.prisma.creditNote.findMany({ where: { policyId }, select: { id: true } }),
      ]);
      [...endorsements, ...claims, ...invoices, ...debitNotes, ...creditNotes].forEach((r) => ids.add(r.id));
    }
    const idList = [...ids];

    const [audits, acts] = await Promise.all([
      idList.length ? this.prisma.auditLog.findMany({ where: { entityId: { in: idList } }, orderBy: { createdAt: "asc" }, select: { userId: true, action: true, entity: true, meta: true, createdAt: true } }) : Promise.resolve([]),
      dealId ? this.prisma.crmActivity.findMany({ where: { entityType: "deal", entityId: dealId }, orderBy: { createdAt: "asc" }, select: { authorId: true, type: true, body: true, createdAt: true } }) : Promise.resolve([]),
    ]);

    // حلّ أسماء المنفِّذين دفعة واحدة
    const userIds = [...new Set([...audits.map((a) => a.userId), ...acts.map((a) => a.authorId)].filter((x): x is string => !!x))];
    const users = userIds.length ? await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } }) : [];
    const nameOf = new Map(users.map((u) => [u.id, u.fullName]));
    const actorOf = (uid: string | null) => (uid ? nameOf.get(uid) ?? "غير معروف" : "النظام");

    const events: TimelineEvent[] = [
      ...audits.map((a) => ({
        at: a.createdAt,
        actor: actorOf(a.userId),
        phase: auditPhase(a.entity),
        action: a.action,
        label: describeAudit(a.entity, a.action),
      })),
      // سرد طور العلاقات (نصّه عربي جاهز) — نتخطّى stage_change لتفادي التكرار مع audit
      ...acts.map((a) => ({ at: a.createdAt, actor: actorOf(a.authorId), phase: "crm", action: a.type, label: a.body })),
    ].sort((x, y) => x.at.getTime() - y.at.getTime());

    return { events };
  }
}
