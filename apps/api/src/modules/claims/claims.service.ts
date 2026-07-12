import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@ibp/db";
import { PrismaService } from "../../prisma/prisma.service";
import { SequenceService } from "../../common/sequence/sequence.service";
import { AuditService } from "../../common/audit/audit.service";
import { PermissionService } from "../rbac/permission.service";
import { maskClientSensitive } from "../../common/security/dlp";
import { NotificationsService } from "../notifications/notifications.service";
import type { AuthUser } from "../auth/current-user.decorator";
import type { CreateClaimDto } from "./dto/claim.dto";

const asJson = (v: unknown) => v as Prisma.InputJsonValue;
const FIELDS = {
  id: true, sequenceNo: true, status: true, insurerName: true, clientId: true, policyId: true,
  claimedAmount: true, deductible: true, settledAmount: true, incidentDate: true, tenantId: true, createdAt: true,
} as const;
/** حقول العميل لصندوق «بيانات العميل» في تفاصيل المطالبة (الهوية تُخفى بـDLP لغير المخوّلين). */
const CLIENT_FIELDS = {
  id: true, code: true, name: true, type: true, crNumber: true, nationalId: true,
  vatNumber: true, email: true, phone: true, landline: true, contactName: true, city: true, complianceStatus: true,
} as const;

/**
 * المطالبات (المرحلة 6): دورة حياة كاملة — استقبال ← تحقّق ← رفع للمؤمِّن ← تسوية ← إغلاق.
 * معزولة بالمستأجر، محكومة بـ entitlement module.claims، ومسجّلة في التدقيق.
 */
@Injectable()
export class ClaimsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seq: SequenceService,
    private readonly audit: AuditService,
    private readonly permissions: PermissionService,
    private readonly notifications: NotificationsService,
  ) {}

  list() {
    return this.prisma.claim.findMany({ orderBy: { createdAt: "desc" }, select: FIELDS });
  }

  /** يرى الهوية/الآيبان كاملةً فقط من له صلاحية الالتزام أو المالية (DLP). */
  private async canViewSensitive(user: AuthUser) {
    const [c, f] = await Promise.all([this.permissions.can(user.roleId, "compliance", "read"), this.permissions.can(user.roleId, "finance", "read")]);
    return c || f;
  }

  /** يُرفق اسم كاتب كل عنصر في الخطّ الزمني (موظفو المستأجر؛ ردود العميل بلا اسم موظف). */
  private async attachAuthors<T extends { authorId: string | null }>(rows: T[]) {
    const ids = [...new Set(rows.map((r) => r.authorId).filter((x): x is string => !!x))];
    const users = ids.length ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } }) : [];
    const un = new Map(users.map((u) => [u.id, u.fullName]));
    return rows.map((r) => ({ ...r, authorName: r.authorId ? un.get(r.authorId) ?? null : null }));
  }

  /** تفاصيل المطالبة: بيانات العميل الكاملة (مُخفاة PII) + الوثيقة + خطّ زمني بأسماء الكُتّاب. */
  async detail(id: string, user: AuthUser) {
    const claim = await this.prisma.claim.findFirst({ where: { id }, select: { ...FIELDS, details: true } });
    if (!claim) throw new NotFoundException("المطالبة غير موجودة");
    const [canView, client, policy, activities] = await Promise.all([
      this.canViewSensitive(user),
      claim.clientId ? this.prisma.client.findFirst({ where: { id: claim.clientId }, select: CLIENT_FIELDS }) : Promise.resolve(null),
      claim.policyId ? this.prisma.policy.findFirst({ where: { id: claim.policyId }, select: { id: true, sequenceNo: true, productLineCode: true, insurerName: true } }) : Promise.resolve(null),
      this.prisma.crmActivity.findMany({ where: { entityType: "claim", entityId: id }, orderBy: { createdAt: "desc" }, take: 200, select: { id: true, type: true, visibility: true, body: true, authorId: true, createdAt: true } }),
    ]);
    const timeline = await this.attachAuthors(activities);
    return { ...claim, client: client ? maskClientSensitive(client, canView) : null, policy, timeline };
  }

  /** ملاحظة داخلية (internal) أو رد ظاهر للعميل (client ⇒ يظهر في البوّابة + يُشعِر العميل `claim_reply`). */
  async addNote(tenantId: string, userId: string, id: string, body: string, visibility: "internal" | "client" = "internal") {
    const claim = await this.prisma.claim.findFirst({ where: { id }, select: { id: true, sequenceNo: true, clientId: true } });
    if (!claim) throw new NotFoundException("المطالبة غير موجودة");
    const isClient = visibility === "client";
    await this.prisma.crmActivity.create({ data: { tenantId, entityType: "claim", entityId: id, type: isClient ? "reply" : "note", visibility, body, authorId: userId } });
    await this.audit.log({ tenantId, userId, action: "update", entity: "claim", entityId: id, meta: { activity: isClient ? "reply" : "note" } });
    if (isClient && claim.clientId) {
      const c = await this.prisma.client.findFirst({ where: { id: claim.clientId }, select: { email: true, phone: true } });
      if (c) void this.notifications.notify(tenantId, "claim_reply", { email: c.email ?? undefined, phone: c.phone ?? undefined, clientId: claim.clientId }, { ref: claim.sequenceNo ?? id }).catch(() => undefined);
    }
    return { ok: true };
  }

  async create(tenantId: string, userId: string, dto: CreateClaimDto) {
    const sequenceNo = await this.seq.nextClaimSeq();
    const claim = await this.prisma.claim.create({
      data: {
        tenantId,
        sequenceNo,
        clientId: dto.clientId ?? null,
        policyId: dto.policyId ?? null,
        insurerName: dto.insurerName ?? null,
        incidentDate: dto.incidentDate ? new Date(dto.incidentDate) : null,
        claimedAmount: dto.claimedAmount ?? null,
        deductible: dto.deductible ?? null,
        status: "RECEIVED",
        details: dto.details ? asJson(dto.details) : undefined,
      },
      select: FIELDS,
    });
    await this.audit.log({ tenantId, userId, action: "create", entity: "claim", entityId: claim.id, meta: { sequenceNo } });
    // إشعار العميل باستلام مطالبته (لا يُفشل إنشاء المطالبة عند تعذّره)
    if (claim.clientId) {
      const client = await this.prisma.client.findFirst({ where: { id: claim.clientId }, select: { email: true, phone: true } });
      if (client) void this.notifications.notify(tenantId, "claim_ack", { email: client.email ?? undefined, phone: client.phone ?? undefined, clientId: claim.clientId ?? undefined }, { ref: sequenceNo }).catch(() => undefined);
    }
    // إشعار فريق المطالبات بمطالبة جديدة
    void this.notifications.notifyStaff(tenantId, "staff_claim_created", { ref: sequenceNo }).catch(() => undefined);
    return claim;
  }

  async setStatus(tenantId: string, userId: string, id: string, status: string, settledAmount?: number) {
    const exists = await this.prisma.claim.findFirst({ where: { id } });
    if (!exists) throw new NotFoundException("المطالبة غير موجودة");
    const claim = await this.prisma.claim.update({
      where: { id },
      data: { status: status as never, settledAmount: settledAmount ?? undefined },
      select: FIELDS,
    });
    await this.audit.log({ tenantId, userId, action: "update", entity: "claim", entityId: id, meta: { status, settledAmount } });
    return claim;
  }
}
