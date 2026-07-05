import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Prisma } from "@ibp/db";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "../../common/storage/storage.service";
import { AuditService } from "../../common/audit/audit.service";
import { SequenceService } from "../../common/sequence/sequence.service";
import { RateLimitService } from "../../common/security/rate-limit.service";
import { NotificationsService } from "../notifications/notifications.service";
import type { SubmitClaimDto, SubmitServiceDto } from "./dto/portal.dto";

const asJson = (v: unknown) => v as Prisma.InputJsonValue;

/**
 * بوّابة العميل (المرحلة 8ب) — نطاق `client`.
 * كل الاستعلامات تخضع لعزل المستأجر تلقائياً (tenantId في ALS) + تُفلتر صراحةً بـ clientId
 * (العميل يرى بياناته هو فقط). لا كتابة — البوّابة للعرض والمتابعة فقط (عدا تعليم إشعاراته كمقروءة).
 */
@Injectable()
export class PortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly seq: SequenceService,
    private readonly rateLimit: RateLimitService,
    private readonly notifications: NotificationsService,
  ) {}

  /** إشعارات العميل داخل البوّابة (in-app). */
  notifications_list(clientId: string) { return this.notifications.inboxClient(clientId); }
  notificationsUnread(clientId: string) { return this.notifications.unreadClient(clientId); }
  notificationRead(clientId: string, id: string) { return this.notifications.markReadClient(clientId, id); }

  async login(email: string, password: string) {
    await this.rateLimit.assertNotLocked("login", email);
    const user = await this.prisma.clientUser.findFirst({
      where: { email },
      include: { client: { select: { id: true, name: true, code: true } } },
    });
    if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      await this.rateLimit.recordFailure("login", email);
      throw new UnauthorizedException("بيانات الدخول غير صحيحة");
    }
    await this.rateLimit.clear("login", email);
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      scope: "client",
      tenantId: user.tenantId,
      clientId: user.clientId,
      email: user.email,
    });
    await this.audit.log({ tenantId: user.tenantId, userId: user.id, action: "login", entity: "client_user", entityId: user.id, meta: { portal: true } });
    return { accessToken, user: { id: user.id, email: user.email, fullName: user.fullName, client: user.client } };
  }

  async me(clientId: string) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId },
      select: { id: true, code: true, name: true, type: true, crNumber: true, nationalId: true, email: true, phone: true, city: true, complianceStatus: true },
    });
    if (!client) throw new NotFoundException("العميل غير موجود");
    return client;
  }

  policies(clientId: string) {
    return this.prisma.policy.findMany({
      where: { clientId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, sequenceNo: true, productLineCode: true, insurerName: true, status: true,
        premium: true, vat: true, totalPremium: true, sumInsured: true, startDate: true, endDate: true, createdAt: true,
      },
    });
  }

  /** تفاصيل وثيقة للعميل (مقصورة على وثائقه) + مطالباتها ومستنداتها. */
  async policyDetail(clientId: string, id: string) {
    const policy = await this.prisma.policy.findFirst({
      where: { id, clientId },
      select: { id: true, sequenceNo: true, productLineCode: true, insurerName: true, insurerPolicyNo: true, status: true, premium: true, vat: true, totalPremium: true, sumInsured: true, startDate: true, endDate: true },
    });
    if (!policy) throw new NotFoundException("الوثيقة غير موجودة");
    const [claims, documents] = await Promise.all([
      this.prisma.claim.findMany({ where: { policyId: id, clientId }, orderBy: { createdAt: "desc" }, select: { id: true, sequenceNo: true, status: true, claimedAmount: true, incidentDate: true } }),
      this.prisma.document.findMany({ where: { entityId: id }, orderBy: { createdAt: "desc" }, select: { id: true, fileName: true, docType: true, createdAt: true } }),
    ]);
    return { policy, claims, documents };
  }

  /** يتحقّق أن الوثيقة تخصّ العميل (حماية قبل أي تقديم عليها). */
  private async assertOwnsPolicy(clientId: string, policyId: string) {
    const p = await this.prisma.policy.findFirst({ where: { id: policyId, clientId }, select: { id: true, sequenceNo: true, insurerName: true } });
    if (!p) throw new ForbiddenException("الوثيقة غير مرتبطة بحسابك");
    return p;
  }

  /** تقديم مطالبة من البوّابة على وثيقة العميل ⇒ مطالبة RECEIVED + إشعار فريق المطالبات. */
  async submitClaim(tenantId: string, clientId: string, dto: SubmitClaimDto) {
    const policy = await this.assertOwnsPolicy(clientId, dto.policyId);
    const sequenceNo = await this.seq.nextClaimSeq();
    const claim = await this.prisma.claim.create({
      data: {
        tenantId, sequenceNo, clientId, policyId: dto.policyId, insurerName: policy.insurerName ?? null,
        incidentDate: dto.incidentDate ? new Date(dto.incidentDate) : null,
        claimedAmount: dto.claimedAmount ?? null, status: "RECEIVED",
        details: dto.description ? asJson({ description: dto.description, viaPortal: true }) : asJson({ viaPortal: true }),
      },
      select: { id: true, sequenceNo: true, status: true },
    });
    await this.audit.log({ tenantId, userId: clientId, action: "create", entity: "claim", entityId: claim.id, meta: { viaPortal: true } });
    void this.notifications.notifyStaff(tenantId, "staff_claim_created", { ref: claim.sequenceNo ?? claim.id }).catch(() => undefined);
    return claim;
  }

  /** تقديم طلب خدمة من البوّابة (شهادة/نسخة/تعديل/إلغاء/تجديد/استفسار) ⇒ OPEN + إشعار. */
  async submitService(tenantId: string, clientId: string, dto: SubmitServiceDto) {
    if (dto.policyId) await this.assertOwnsPolicy(clientId, dto.policyId);
    const sequenceNo = await this.seq.nextServiceSeq();
    const sr = await this.prisma.serviceRequest.create({
      data: {
        tenantId, sequenceNo, clientId, policyId: dto.policyId ?? null, type: dto.type,
        subject: dto.subject ?? null, status: "OPEN",
        details: dto.description ? asJson({ description: dto.description, viaPortal: true }) : asJson({ viaPortal: true }),
      },
      select: { id: true, sequenceNo: true, type: true, status: true },
    });
    await this.audit.log({ tenantId, userId: clientId, action: "create", entity: "service_request", entityId: sr.id, meta: { viaPortal: true, type: dto.type } });
    void this.notifications.notifyStaff(tenantId, "staff_request_created", { ref: sr.sequenceNo ?? sr.id }).catch(() => undefined);
    return sr;
  }

  /** طلب تجديد وثيقة (اختصار — طلب خدمة نوعه renewal). */
  async requestRenewal(tenantId: string, clientId: string, policyId: string) {
    const policy = await this.assertOwnsPolicy(clientId, policyId);
    return this.submitService(tenantId, clientId, { type: "renewal", policyId, subject: `طلب تجديد الوثيقة ${policy.sequenceNo ?? policyId}` });
  }

  async requests(clientId: string) {
    const [policyRequests, serviceRequests] = await Promise.all([
      this.prisma.policyRequest.findMany({
        where: { clientId },
        orderBy: { createdAt: "desc" },
        select: { id: true, sequenceNo: true, productLineCode: true, status: true, createdAt: true },
      }),
      this.prisma.serviceRequest.findMany({
        where: { clientId },
        orderBy: { createdAt: "desc" },
        select: { id: true, sequenceNo: true, type: true, subject: true, status: true, createdAt: true },
      }),
    ]);
    return { policyRequests, serviceRequests };
  }

  claims(clientId: string) {
    return this.prisma.claim.findMany({
      where: { clientId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, sequenceNo: true, insurerName: true, incidentDate: true, status: true,
        claimedAmount: true, deductible: true, settledAmount: true, createdAt: true,
      },
    });
  }

  /** كشف الحساب: إشعارات المدين (مستحقّ) + الإشعارات الدائنة + الفواتير + الرصيد المستحقّ بعد التحصيل. */
  async statement(clientId: string) {
    const [debitNotes, creditNotes] = await Promise.all([
      this.prisma.debitNote.findMany({
        where: { clientId },
        orderBy: { createdAt: "desc" },
        select: { id: true, sequenceNo: true, policyId: true, netAmount: true, vatAmount: true, settledAmount: true, createdAt: true },
      }),
      this.prisma.creditNote.findMany({ where: { clientId }, orderBy: { createdAt: "desc" }, select: { id: true, sequenceNo: true, policyId: true, netAmount: true, vatAmount: true, createdAt: true } }),
    ]);
    const policyIds = (await this.prisma.policy.findMany({ where: { clientId }, select: { id: true } })).map((p) => p.id);
    const invoices = policyIds.length
      ? await this.prisma.invoice.findMany({
          where: { policyId: { in: policyIds } },
          orderBy: { createdAt: "desc" },
          select: { id: true, sequenceNo: true, insurerName: true, netAmount: true, vatAmount: true, totalAmount: true, status: true, createdAt: true },
        })
      : [];
    const num = (v: unknown) => Number(v ?? 0);
    const charged = debitNotes.reduce((s, d) => s + num(d.netAmount) + num(d.vatAmount), 0);
    const collected = debitNotes.reduce((s, d) => s + num(d.settledAmount), 0);
    const credited = creditNotes.reduce((s, c) => s + num(c.netAmount) + num(c.vatAmount), 0);
    const outstanding = Math.round((charged - collected - credited) * 100) / 100;
    return { debitNotes, creditNotes, invoices, outstanding, collected: Math.round(collected * 100) / 100 };
  }

  /** كل معرّفات الكيانات التي تخصّ العميل (هو + طلباته + مطالباته + وثائقه). أساس فحص ملكية المستندات. */
  private async ownedEntityIds(clientId: string): Promise<string[]> {
    const [requests, claims, policies] = await Promise.all([
      this.prisma.policyRequest.findMany({ where: { clientId }, select: { id: true } }),
      this.prisma.claim.findMany({ where: { clientId }, select: { id: true } }),
      this.prisma.policy.findMany({ where: { clientId }, select: { id: true } }),
    ]);
    return [clientId, ...requests.map((r) => r.id), ...claims.map((c) => c.id), ...policies.map((p) => p.id)];
  }

  /** مستندات العميل: المرتبطة به + بطلباته ومطالباته ووثائقه. عرض عبر رابط موقّت فقط. */
  async documents(clientId: string) {
    const entityIds = await this.ownedEntityIds(clientId);
    return this.prisma.document.findMany({
      where: { entityId: { in: entityIds } },
      orderBy: { createdAt: "desc" },
      select: { id: true, fileName: true, mime: true, sizeBytes: true, docType: true, entityType: true, createdAt: true },
    });
  }

  /** رابط عرض موقّت لمستند يخصّ العميل فقط (يفحص الملكية قبل التوقيع). */
  async documentUrl(tenantId: string, clientId: string, documentId: string) {
    const doc = await this.prisma.document.findFirst({ where: { id: documentId }, select: { id: true, storageKey: true, fileName: true, mime: true, entityId: true } });
    if (!doc) throw new NotFoundException("المستند غير موجود");
    const entityIds = await this.ownedEntityIds(clientId);
    if (!entityIds.includes(doc.entityId)) throw new NotFoundException("المستند غير موجود");
    await this.audit.log({ tenantId, userId: clientId, action: "file_url", entity: "document", entityId: documentId, meta: { portal: true } });
    return { fileName: doc.fileName, mime: doc.mime, view: this.storage.presignDownload(doc.storageKey) };
  }
}
