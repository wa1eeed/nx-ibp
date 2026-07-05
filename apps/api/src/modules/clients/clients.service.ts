import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@ibp/db";
import { PrismaService } from "../../prisma/prisma.service";
import { SequenceService } from "../../common/sequence/sequence.service";
import { AuditService } from "../../common/audit/audit.service";
import { PermissionService } from "../rbac/permission.service";
import { maskClientSensitive } from "../../common/security/dlp";
import type { AuthUser } from "../auth/current-user.decorator";
import type { CreateClientDto } from "./dto/create-client.dto";

const RETENTION_DEFAULT_YEARS = 10; // احتفاظ افتراضي (سجلّات التأمين — SAMA/هيئة التأمين)

const CLIENT_FIELDS = {
  id: true,
  code: true,
  type: true,
  name: true,
  crNumber: true,
  nationalId: true,
  email: true,
  phone: true,
  city: true,
  nationalAddress: true,
  vatNumber: true,
  relationStatus: true,
  legalForm: true,
  source: true,
  producerName: true,
  businessActivity: true,
  iban: true,
  contacts: true,
  status: true,
  complianceStatus: true,
  complianceNote: true,
  erasedAt: true,
  erasedBy: true,
  tenantId: true,
  createdAt: true,
} as const;

/**
 * سجل العملاء (أفراد/منشآت). معزول تلقائياً بالمستأجر. كود تجاري + بوّابة التزام.
 */
@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seq: SequenceService,
    private readonly audit: AuditService,
    private readonly permissions: PermissionService,
  ) {}

  /** هل يرى المستخدم البيانات الحسّاسة كاملةً؟ (الالتزام أو المالية فقط — أقلّ امتياز). */
  private async canViewSensitive(user: AuthUser): Promise<boolean> {
    if (!user.roleId) return false;
    const [compliance, finance] = await Promise.all([
      this.permissions.can(user.roleId, "compliance", "read"),
      this.permissions.can(user.roleId, "finance", "read"),
    ]);
    return compliance || finance;
  }

  async list(user: AuthUser) {
    const rows = await this.prisma.client.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, code: true, type: true, name: true, crNumber: true, nationalId: true, phone: true, city: true, complianceStatus: true, erasedAt: true, tenantId: true },
    });
    const canView = await this.canViewSensitive(user);
    return rows.map((c) => maskClientSensitive(c, canView));
  }

  async getOne(id: string, user: AuthUser) {
    const client = await this.prisma.client.findUnique({ where: { id }, select: CLIENT_FIELDS });
    if (!client) return null;
    return maskClientSensitive(client, await this.canViewSensitive(user));
  }

  /** نظرة 360° مجمّعة للعميل — كل ما يخصّه (معزول بالمستأجر تلقائيًا). */
  async overview(id: string, user: AuthUser) {
    const raw = await this.prisma.client.findUnique({ where: { id }, select: CLIENT_FIELDS });
    if (!raw) throw new NotFoundException("العميل غير موجود");
    const client = maskClientSensitive(raw, await this.canViewSensitive(user));
    const [policies, claims, requests, verifications, debitNotes, activities] = await Promise.all([
      this.prisma.policy.findMany({ where: { clientId: id }, orderBy: { createdAt: "desc" }, select: { id: true, sequenceNo: true, productLineCode: true, insurerName: true, premium: true, totalPremium: true, status: true, startDate: true, endDate: true, createdAt: true } }),
      this.prisma.claim.findMany({ where: { clientId: id }, orderBy: { createdAt: "desc" }, select: { id: true, sequenceNo: true, insurerName: true, claimedAmount: true, settledAmount: true, status: true, incidentDate: true, createdAt: true } }),
      this.prisma.policyRequest.findMany({ where: { clientId: id }, orderBy: { createdAt: "desc" }, select: { id: true, sequenceNo: true, productLineCode: true, status: true, createdAt: true } }),
      this.prisma.verificationCheck.findMany({ where: { clientId: id }, orderBy: { createdAt: "desc" }, select: { id: true, checkType: true, status: true, riskLevel: true, createdAt: true } }),
      this.prisma.debitNote.findMany({ where: { clientId: id }, orderBy: { createdAt: "desc" }, select: { id: true, sequenceNo: true, netAmount: true, vatAmount: true, settledAmount: true, createdAt: true } }),
      this.prisma.crmActivity.findMany({ where: { entityType: "client", entityId: id }, orderBy: { createdAt: "desc" }, take: 50 }),
    ]);
    const creditNotes = await this.prisma.creditNote.findMany({ where: { clientId: id }, orderBy: { createdAt: "desc" }, select: { id: true, sequenceNo: true, netAmount: true, vatAmount: true, createdAt: true } });
    const policyIds = policies.map((p) => p.id);
    const documents = await this.prisma.document.findMany({
      where: { OR: [{ entityType: "client", entityId: id }, ...(policyIds.length ? [{ entityId: { in: policyIds } }] : [])] },
      orderBy: { createdAt: "desc" }, select: { id: true, fileName: true, docType: true, entityType: true, createdAt: true },
    });
    const num = (d: Prisma.Decimal | null) => (d == null ? 0 : Number(d));
    // المستحقّ = إجمالي الإشعارات − المُحصَّل (سندات القبض) − الإشعارات الدائنة (قسط مُرتجَع)
    const charged = debitNotes.reduce((s, d) => s + num(d.netAmount) + num(d.vatAmount), 0);
    const collected = debitNotes.reduce((s, d) => s + num(d.settledAmount), 0);
    const credited = creditNotes.reduce((s, c) => s + num(c.netAmount) + num(c.vatAmount), 0);
    const totalDue = charged - collected - credited;
    const r2 = (n: number) => +n.toFixed(2);
    // إشعارات المدين مُثراة بالمُحصَّل/المتبقّي والحالة (كي تعكس صفحة العميل التحصيل)
    const debitNotesEnriched = debitNotes.map((d) => {
      const gross = r2(num(d.netAmount) + num(d.vatAmount));
      const settled = r2(num(d.settledAmount));
      return { id: d.id, sequenceNo: d.sequenceNo, netAmount: d.netAmount, vatAmount: d.vatAmount, total: gross, settled, outstanding: r2(gross - settled), status: settled <= 0 ? "outstanding" : settled >= gross ? "paid" : "partial", createdAt: d.createdAt };
    });
    return {
      client, policies, claims, requests, verifications, debitNotes: debitNotesEnriched,
      creditNotes: creditNotes.map((c) => ({ ...c, total: r2(num(c.netAmount) + num(c.vatAmount)) })),
      documents, activities,
      summary: { policies: policies.length, claims: claims.length, requests: requests.length, documents: documents.length, totalDue: r2(totalDue), collected: r2(collected) },
    };
  }

  async create(tenantId: string, userId: string, dto: CreateClientDto) {
    const code = await this.seq.nextClientCode();
    try {
      const client = await this.prisma.client.create({
        data: {
          tenantId,
          code,
          type: dto.type,
          name: dto.name,
          crNumber: dto.crNumber ?? null,
          nationalId: dto.nationalId ?? null,
          email: dto.email ?? null,
          phone: dto.phone ?? null,
          city: dto.city ?? null,
          nationalAddress: dto.nationalAddress ?? null,
          vatNumber: dto.vatNumber ?? null,
          relationStatus: dto.relationStatus ?? null,
          legalForm: dto.legalForm ?? null,
          source: dto.source ?? null,
          producerName: dto.producerName ?? null,
          businessActivity: dto.businessActivity ?? null,
          iban: dto.iban ?? null,
          accountManagerId: dto.accountManagerId ?? null,
          contacts: dto.contacts ? (dto.contacts as unknown as Prisma.InputJsonValue) : undefined,
          // يبدأ بانتظار اعتماد الالتزام قبل السماح بطلب الأسعار
          complianceStatus: "PENDING",
        },
        select: CLIENT_FIELDS,
      });
      await this.audit.log({ tenantId, userId, action: "create", entity: "client", entityId: client.id, meta: { code } });
      return client;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new ConflictException("عميل بنفس السجل التجاري أو الهوية أو الكود موجود مسبقاً");
      }
      throw e;
    }
  }

  /** بوّابة الالتزام: اعتماد/رفض العميل قبل السماح بطلبات الأسعار. */
  async setCompliance(tenantId: string, userId: string, id: string, decision: "APPROVED" | "REJECTED", note?: string) {
    const exists = await this.prisma.client.findFirst({ where: { id } });
    if (!exists) throw new NotFoundException("العميل غير موجود");

    const updated = await this.prisma.client.update({
      where: { id },
      data: { complianceStatus: decision, complianceNote: note ?? null },
      select: { id: true, name: true, complianceStatus: true, complianceNote: true, tenantId: true },
    });
    await this.audit.log({ tenantId, userId, action: "approve", entity: "client", entityId: id, meta: { decision, note: note ?? null } });
    return updated;
  }

  // ————————————————— حق المحو (PDPL) + الاحتفاظ والإتلاف الآمن —————————————————

  /**
   * محو بيانات العميل الشخصية (حق المحو — PDPL): يُخفي كل PII ويُبقي **الهيكل المالي**
   * (الوثائق/المطالبات/القيود/الفواتير) لسلامة التدقيق وZATCA. يُسجَّل في سجلّ الإتلاف (تدقيق ثابت).
   */
  async erase(user: AuthUser, id: string, reason?: string) {
    const client = await this.prisma.client.findFirst({ where: { id }, select: { id: true, code: true, erasedAt: true } });
    if (!client) throw new NotFoundException("العميل غير موجود");
    if (client.erasedAt) throw new ConflictException("سبق محو بيانات هذا العميل");
    const updated = await this.prisma.client.update({
      where: { id },
      data: {
        name: "«عميل محذوف» (PDPL)",
        crNumber: null, nationalId: null, email: null, phone: null, nationalAddress: null,
        vatNumber: null, iban: null, producerName: null, businessActivity: null,
        contacts: Prisma.DbNull,
        status: "erased",
        erasedAt: new Date(), erasedBy: user.userId,
      },
      select: { id: true, code: true, status: true, erasedAt: true, tenantId: true },
    });
    await this.audit.log({ tenantId: user.tenantId, userId: user.userId, action: "erase", entity: "client", entityId: id, meta: { code: client.code, reason: reason ?? "PDPL erasure" } });
    return updated;
  }

  /** سجلّ الإتلاف: العملاء الذين مُحيت بياناتهم (كود + توقيت + مُنفِّذ — بلا PII). */
  async erasures() {
    return this.prisma.client.findMany({
      where: { erasedAt: { not: null } },
      orderBy: { erasedAt: "desc" },
      select: { id: true, code: true, status: true, erasedAt: true, erasedBy: true },
    });
  }

  /** مدّة الاحتفاظ (سنوات) — من سياسة الشركة، وإلا الافتراضي. */
  private async retentionYears(tenantId: string): Promise<number> {
    const cfg = await this.prisma.tenantConfig.findFirst({ where: { tenantId }, select: { securityPolicy: true } });
    const y = ((cfg?.securityPolicy ?? {}) as { retentionYears?: number }).retentionYears;
    return typeof y === "number" && y > 0 ? y : RETENTION_DEFAULT_YEARS;
  }

  /**
   * تقرير الاستحقاق للإتلاف: عملاء غير ممحوّين تجاوز آخر نشاط لهم مدّة الاحتفاظ
   * (آخر انتهاء وثيقة، أو تاريخ الإنشاء إن لا وثائق). تقرير استعراضي — الإتلاف يدويّ بقرار.
   */
  async retentionDue(tenantId: string) {
    const years = await this.retentionYears(tenantId);
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - years);
    const clients = await this.prisma.client.findMany({
      where: { erasedAt: null },
      select: { id: true, code: true, name: true, createdAt: true },
    });
    const due: Array<{ id: string; code: string | null; name: string; lastActivity: Date }> = [];
    for (const c of clients) {
      const lastPolicy = await this.prisma.policy.findFirst({ where: { clientId: c.id }, orderBy: { endDate: "desc" }, select: { endDate: true } });
      const ref = lastPolicy?.endDate ?? c.createdAt;
      if (ref && ref < cutoff) due.push({ id: c.id, code: c.code, name: c.name, lastActivity: ref });
    }
    return { retentionYears: years, cutoff, count: due.length, due };
  }
}
