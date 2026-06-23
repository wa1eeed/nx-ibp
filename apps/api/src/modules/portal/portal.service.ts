import { Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "../../common/storage/storage.service";
import { AuditService } from "../../common/audit/audit.service";

/**
 * بوّابة العميل (المرحلة 8ب) — نطاق `client`.
 * كل الاستعلامات تخضع لعزل المستأجر تلقائياً (tenantId في ALS) + تُفلتر صراحةً بـ clientId
 * (العميل يرى بياناته هو فقط). لا كتابة — البوّابة للعرض والمتابعة فقط.
 */
@Injectable()
export class PortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.clientUser.findFirst({
      where: { email },
      include: { client: { select: { id: true, name: true, code: true } } },
    });
    if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException("بيانات الدخول غير صحيحة");
    }
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
        premium: true, vat: true, totalPremium: true, startDate: true, endDate: true, createdAt: true,
      },
    });
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

  /** كشف الحساب: إشعارات المدين (مستحقّ على العميل) + الفواتير الضريبية لوثائقه + الرصيد المستحق. */
  async statement(clientId: string) {
    const debitNotes = await this.prisma.debitNote.findMany({
      where: { clientId },
      orderBy: { createdAt: "desc" },
      select: { id: true, sequenceNo: true, policyId: true, netAmount: true, vatAmount: true, createdAt: true },
    });
    const policyIds = (await this.prisma.policy.findMany({ where: { clientId }, select: { id: true } })).map((p) => p.id);
    const invoices = policyIds.length
      ? await this.prisma.invoice.findMany({
          where: { policyId: { in: policyIds } },
          orderBy: { createdAt: "desc" },
          select: { id: true, sequenceNo: true, insurerName: true, netAmount: true, vatAmount: true, totalAmount: true, status: true, createdAt: true },
        })
      : [];
    const outstanding = debitNotes.reduce((sum, d) => sum + Number(d.netAmount ?? 0) + Number(d.vatAmount ?? 0), 0);
    return { debitNotes, invoices, outstanding };
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
