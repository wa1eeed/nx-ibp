import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Prisma } from "@ibp/db";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "../../common/storage/storage.service";
import { AuditService } from "../../common/audit/audit.service";
import { SequenceService } from "../../common/sequence/sequence.service";
import { RateLimitService } from "../../common/security/rate-limit.service";
import { NotificationsService } from "../notifications/notifications.service";
import { CoverNotesService } from "../cover-notes/cover-notes.service";
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
    private readonly coverNotes: CoverNotesService,
  ) {}

  /** مذكرات التغطية المؤقتة للعميل (§4.2). */
  async clientCoverNotes(clientId: string) {
    const rows = await this.prisma.coverNote.findMany({ where: { clientId }, orderBy: { createdAt: "desc" }, select: { id: true, sequenceNo: true, insurerName: true, productLineCode: true, totalPremium: true, validUntil: true, status: true, createdAt: true } });
    const now = Date.now();
    return rows.map((r) => ({ ...r, totalPremium: r.totalPremium ? Number(r.totalPremium) : null, expired: r.status === "active" && new Date(r.validUntil).getTime() < now }));
  }

  /** مستند مذكرة التغطية المطبوع (بعد التحقّق من ملكية العميل). */
  async clientCoverNoteDocument(tenantId: string, clientId: string, id: string) {
    const owned = await this.prisma.coverNote.findFirst({ where: { id, clientId }, select: { id: true } });
    if (!owned) throw new NotFoundException("مذكرة التغطية غير موجودة");
    return this.coverNotes.document(tenantId, id);
  }

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

  // ————————————————— توفير دخول البوّابة (تزويد + تفعيل) —————————————————
  /** أصل الواجهة لبناء رابط الدعوة (مطابق لنمط الفوترة). */
  private appUrl(): string {
    return process.env.APP_PUBLIC_URL ?? process.env.CORS_ORIGINS?.split(",")[0]?.trim() ?? "http://localhost:3000";
  }

  /** يتحقّق من توكن الدعوة (JWT بنطاق `portal-invite`) ويعيد حمولته. */
  private async verifyInvite(token: string): Promise<{ sub: string; scope: string; tenantId: string; clientId: string }> {
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; scope: string; tenantId: string; clientId: string }>(token);
      if (payload.scope !== "portal-invite" || !payload.sub) throw new Error("bad scope");
      return payload;
    } catch {
      throw new UnauthorizedException("رابط الدعوة غير صالح أو منتهي الصلاحية");
    }
  }

  /** قائمة مستخدمي بوّابة العميل (للموظف) — مع حالة التفعيل. مقيَّدة بالعميل والمستأجر. */
  async listPortalUsers(tenantId: string, clientId: string) {
    const client = await this.prisma.client.findFirst({ where: { id: clientId, tenantId }, select: { id: true } });
    if (!client) throw new NotFoundException("العميل غير موجود");
    const users = await this.prisma.clientUser.findMany({ where: { clientId }, orderBy: { createdAt: "asc" }, select: { id: true, email: true, fullName: true, passwordHash: true, createdAt: true } });
    return users.map((u) => ({ id: u.id, email: u.email, fullName: u.fullName, activated: !!u.passwordHash, createdAt: u.createdAt }));
  }

  /** دعوة عميل لبوّابته: يُنشئ (أو يُعيد استخدام) `ClientUser` بلا كلمة مرور + رابط تفعيل موقّع + بريد. */
  async invitePortalUser(tenantId: string, clientId: string, actorId: string, dto: { email: string; fullName: string }) {
    const client = await this.prisma.client.findFirst({ where: { id: clientId, tenantId }, select: { id: true, name: true } });
    if (!client) throw new NotFoundException("العميل غير موجود");
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.clientUser.findFirst({ where: { email } });
    let user = existing;
    if (existing) {
      if (existing.clientId !== clientId || existing.tenantId !== tenantId) throw new ConflictException("هذا البريد مُستخدَم لعميل آخر");
    } else {
      user = await this.prisma.clientUser.create({ data: { tenantId, clientId, email, fullName: dto.fullName.trim() } });
    }
    const token = await this.jwt.signAsync({ sub: user!.id, scope: "portal-invite", tenantId, clientId }, { expiresIn: "7d" });
    const link = `${this.appUrl()}/portal/activate?token=${token}`;
    await this.notifications
      .notify(tenantId, "portal_invite", { email, clientId }, { name: user!.fullName, link })
      .catch(() => undefined);
    await this.audit.log({ tenantId, userId: actorId, action: existing ? "update" : "create", entity: "client_user", entityId: user!.id, meta: { invite: true } });
    return { user: { id: user!.id, email: user!.email, fullName: user!.fullName, activated: !!user!.passwordHash }, inviteLink: link };
  }

  /** إلغاء دخول مستخدم البوّابة (تصفير كلمة المرور) — يمنع الدخول ويُبقي الهوية للمراسلات السابقة. */
  async revokePortalUser(tenantId: string, clientId: string, userId: string, actorId: string) {
    const user = await this.prisma.clientUser.findFirst({ where: { id: userId, clientId }, select: { id: true } });
    if (!user) throw new NotFoundException("مستخدم البوّابة غير موجود");
    await this.prisma.clientUser.update({ where: { id: userId }, data: { passwordHash: null } });
    await this.audit.log({ tenantId, userId: actorId, action: "update", entity: "client_user", entityId: userId, meta: { revoke: true } });
    return { id: userId, activated: false };
  }

  /** معلومات الدعوة لصفحة تعيين كلمة المرور (عام) — بريد/اسم/اسم الشركة. */
  async inviteInfo(token: string) {
    const payload = await this.verifyInvite(token);
    const user = await this.prisma.clientUser.findFirst({ where: { id: payload.sub }, include: { client: { select: { name: true } } } });
    if (!user) throw new UnauthorizedException("دعوة غير صالحة");
    return { email: user.email, fullName: user.fullName, clientName: user.client.name, activated: !!user.passwordHash };
  }

  /** تفعيل الحساب: يتحقّق من توكن الدعوة، يضبط كلمة المرور، ويسجّل الدخول تلقائيًا. */
  async activate(token: string, password: string) {
    if (!password || password.length < 8) throw new BadRequestException("كلمة المرور يجب ألا تقلّ عن 8 أحرف");
    const payload = await this.verifyInvite(token);
    const user = await this.prisma.clientUser.findFirst({ where: { id: payload.sub }, include: { client: { select: { id: true, name: true, code: true } } } });
    if (!user) throw new UnauthorizedException("دعوة غير صالحة");
    const passwordHash = await bcrypt.hash(password, 10);
    await this.prisma.clientUser.update({ where: { id: user.id }, data: { passwordHash } });
    await this.audit.log({ tenantId: user.tenantId, userId: user.id, action: "update", entity: "client_user", entityId: user.id, meta: { activated: true } });
    const accessToken = await this.jwt.signAsync({ sub: user.id, scope: "client", tenantId: user.tenantId, clientId: user.clientId, email: user.email });
    return { accessToken, user: { id: user.id, email: user.email, fullName: user.fullName, client: user.client } };
  }

  async me(clientId: string) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId },
      select: { id: true, code: true, name: true, type: true, crNumber: true, nationalId: true, vatNumber: true, email: true, phone: true, landline: true, contactName: true, city: true, nationalAddress: true, complianceStatus: true },
    });
    if (!client) throw new NotFoundException("العميل غير موجود");
    return client;
  }

  /**
   * تحديث بيانات التواصل من البوّابة — العميل يعدّل **حقول التواصل فقط**
   * (جهة التواصل/الجوال/الهاتف/البريد). الحقول المُتحقَّق منها حكوميًّا (CR/الهوية/الضريبي) لا تُعدَّل من البوّابة.
   */
  async updateContact(tenantId: string, clientId: string, dto: { contactName?: string; phone?: string; landline?: string; email?: string }) {
    const exists = await this.prisma.client.findFirst({ where: { id: clientId }, select: { id: true } });
    if (!exists) throw new NotFoundException("العميل غير موجود");
    await this.prisma.client.update({
      where: { id: clientId },
      data: {
        contactName: dto.contactName ?? undefined,
        phone: dto.phone ?? undefined,
        landline: dto.landline ?? undefined,
        email: dto.email ?? undefined,
      },
    });
    await this.audit.log({ tenantId, userId: clientId, action: "update", entity: "client", entityId: clientId, meta: { viaPortal: true, contact: true } });
    return this.me(clientId);
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

  /**
   * تفاصيل طلب خدمة للعميل (مقصورة على طلباته) + المحادثة **الظاهرة للعميل فقط**
   * (visibility=client — الملاحظات الداخلية للموظفين لا تظهر). يميّز ردود العميل نفسه (`mine`).
   */
  async serviceRequestDetail(clientId: string, id: string) {
    const sr = await this.prisma.serviceRequest.findFirst({
      where: { id, clientId },
      select: { id: true, sequenceNo: true, type: true, subject: true, status: true, policyId: true, createdAt: true, updatedAt: true, details: true },
    });
    if (!sr) throw new NotFoundException("طلب الخدمة غير موجود");
    const [policy, activities, clientUsers] = await Promise.all([
      sr.policyId ? this.prisma.policy.findFirst({ where: { id: sr.policyId }, select: { id: true, sequenceNo: true, productLineCode: true } }) : Promise.resolve(null),
      this.prisma.crmActivity.findMany({
        where: { entityType: "service", entityId: id, visibility: "client" },
        orderBy: { createdAt: "asc" },
        select: { id: true, type: true, body: true, authorId: true, createdAt: true },
      }),
      this.prisma.clientUser.findMany({ where: { clientId }, select: { id: true } }),
    ]);
    const mineIds = new Set(clientUsers.map((u) => u.id));
    const staffIds = [...new Set(activities.map((a) => a.authorId).filter((x): x is string => !!x && !mineIds.has(x)))];
    const staff = staffIds.length ? await this.prisma.user.findMany({ where: { id: { in: staffIds } }, select: { id: true, fullName: true } }) : [];
    const staffName = new Map(staff.map((u) => [u.id, u.fullName]));
    const timeline = activities.map((a) => ({
      id: a.id, body: a.body, createdAt: a.createdAt,
      mine: !!a.authorId && mineIds.has(a.authorId),
      authorName: a.authorId && !mineIds.has(a.authorId) ? staffName.get(a.authorId) ?? null : null,
    }));
    return { ...sr, policy, timeline };
  }

  /** رد العميل على طلب خدمته ⇒ يُضاف للمحادثة الظاهرة (visibility=client) + يُشعِر الموظف المُسنَد/الفريق. */
  async replyToService(tenantId: string, clientId: string, clientUserId: string, id: string, body: string) {
    const sr = await this.prisma.serviceRequest.findFirst({ where: { id, clientId }, select: { id: true, sequenceNo: true, assigneeId: true } });
    if (!sr) throw new NotFoundException("طلب الخدمة غير موجود");
    await this.prisma.crmActivity.create({ data: { tenantId, entityType: "service", entityId: id, type: "reply", visibility: "client", body, authorId: clientUserId } });
    await this.audit.log({ tenantId, userId: clientId, action: "update", entity: "service_request", entityId: id, meta: { viaPortal: true, reply: true } });
    const vars = { ref: sr.sequenceNo ?? id };
    if (sr.assigneeId) void this.notifications.notifyUser(tenantId, sr.assigneeId, "staff_service_reply", vars).catch(() => undefined);
    else void this.notifications.notifyStaff(tenantId, "staff_service_reply", vars).catch(() => undefined);
    return { ok: true };
  }

  /** تفاصيل مطالبة للعميل + المحادثة **الظاهرة فقط** (visibility=client). يميّز ردود العميل (`mine`). */
  async claimDetail(clientId: string, id: string) {
    const claim = await this.prisma.claim.findFirst({
      where: { id, clientId },
      select: { id: true, sequenceNo: true, insurerName: true, status: true, claimedAmount: true, deductible: true, settledAmount: true, incidentDate: true, policyId: true, createdAt: true, details: true },
    });
    if (!claim) throw new NotFoundException("المطالبة غير موجودة");
    const [policy, activities, clientUsers] = await Promise.all([
      claim.policyId ? this.prisma.policy.findFirst({ where: { id: claim.policyId }, select: { id: true, sequenceNo: true, productLineCode: true } }) : Promise.resolve(null),
      this.prisma.crmActivity.findMany({ where: { entityType: "claim", entityId: id, visibility: "client" }, orderBy: { createdAt: "asc" }, select: { id: true, body: true, authorId: true, createdAt: true } }),
      this.prisma.clientUser.findMany({ where: { clientId }, select: { id: true } }),
    ]);
    const mineIds = new Set(clientUsers.map((u) => u.id));
    const staffIds = [...new Set(activities.map((a) => a.authorId).filter((x): x is string => !!x && !mineIds.has(x)))];
    const staff = staffIds.length ? await this.prisma.user.findMany({ where: { id: { in: staffIds } }, select: { id: true, fullName: true } }) : [];
    const staffName = new Map(staff.map((u) => [u.id, u.fullName]));
    const timeline = activities.map((a) => ({
      id: a.id, body: a.body, createdAt: a.createdAt,
      mine: !!a.authorId && mineIds.has(a.authorId),
      authorName: a.authorId && !mineIds.has(a.authorId) ? staffName.get(a.authorId) ?? null : null,
    }));
    return { ...claim, policy, timeline };
  }

  /** رد العميل على مطالبته ⇒ يُضاف للمحادثة الظاهرة + يُشعِر فريق المطالبات (`staff_claim_reply`). */
  async replyToClaim(tenantId: string, clientId: string, clientUserId: string, id: string, body: string) {
    const claim = await this.prisma.claim.findFirst({ where: { id, clientId }, select: { id: true, sequenceNo: true } });
    if (!claim) throw new NotFoundException("المطالبة غير موجودة");
    await this.prisma.crmActivity.create({ data: { tenantId, entityType: "claim", entityId: id, type: "reply", visibility: "client", body, authorId: clientUserId } });
    await this.audit.log({ tenantId, userId: clientId, action: "update", entity: "claim", entityId: id, meta: { viaPortal: true, reply: true } });
    void this.notifications.notifyStaff(tenantId, "staff_claim_reply", { ref: claim.sequenceNo ?? id }).catch(() => undefined);
    return { ok: true };
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

  // ── عروض التأمين المقدَّمة للعميل (§4.1) ────────────────────────────────────
  /** حقول العرض الظاهرة للعميل — **بلا أي بيانات عمولة الوسيط** (خصوصية داخلية). */
  private readonly quotationClientSelect = {
    id: true, insurerName: true, rate: true, sumInsured: true, premium: true, policyFees: true, vat: true,
    totalPremium: true, deductible: true, limit: true, validUntil: true, coverFields: true,
    generalRemarks: true, additionalConditions: true, status: true,
  } as const;

  /** يتحقّق أن طلب الأسعار مُقدَّم لهذا العميل (عبر طلبه)، ويعيده مع طلبه. */
  private async ownedProposal(clientId: string, slipId: string) {
    const slip = await this.prisma.slip.findFirst({ where: { id: slipId, presentedAt: { not: null }, request: { clientId } } });
    if (!slip) throw new NotFoundException("العرض غير موجود");
    return slip;
  }

  /** قائمة العروض المقدَّمة للعميل (بحالة قراره) + عدد الخيارات. */
  async proposals(clientId: string) {
    const slips = await this.prisma.slip.findMany({
      where: { presentedAt: { not: null }, request: { clientId } },
      orderBy: { presentedAt: "desc" },
      select: { id: true, sequenceNo: true, presentedAt: true, presentedQuotationIds: true, clientDecision: true, clientDecidedAt: true, request: { select: { productLineCode: true } } },
    });
    return slips.map((s) => ({
      id: s.id, sequenceNo: s.sequenceNo, productLineCode: s.request.productLineCode,
      presentedAt: s.presentedAt, decision: s.clientDecision ?? "pending", decidedAt: s.clientDecidedAt,
      options: s.presentedQuotationIds.length,
    }));
  }

  /** تفاصيل عرض: الخيارات المعروضة (بلا عمولة) + قرار العميل + المقبول. */
  async proposalDetail(clientId: string, slipId: string) {
    const slip = await this.ownedProposal(clientId, slipId);
    const quotations = await this.prisma.quotation.findMany({
      where: { id: { in: slip.presentedQuotationIds } },
      orderBy: { totalPremium: "asc" },
      select: this.quotationClientSelect,
    });
    return {
      id: slip.id, sequenceNo: slip.sequenceNo, presentedAt: slip.presentedAt,
      decision: slip.clientDecision ?? "pending", decidedAt: slip.clientDecidedAt,
      acceptedQuotationId: slip.acceptedQuotationId, decisionNote: slip.clientDecisionNote,
      quotations,
    };
  }

  /** قبول العميل لعرض ⇒ أمر إسناد (الطلب AWARDED) + توثيق القبول + إشعار الوسيط. */
  async acceptProposal(tenantId: string, clientId: string, slipId: string, quotationId: string) {
    const slip = await this.ownedProposal(clientId, slipId);
    if (slip.clientDecision && slip.clientDecision !== "pending") throw new ConflictException("سبق اتخاذ قرار على هذا العرض");
    if (!slip.presentedQuotationIds.includes(quotationId)) throw new BadRequestException("العرض غير مُقدَّم ضمن هذا الطلب");
    await this.prisma.$transaction(async (tx) => {
      await tx.quotation.updateMany({ where: { slipId }, data: { status: "REJECTED" } });
      await tx.quotation.update({ where: { id: quotationId }, data: { status: "SELECTED" } });
      await tx.slip.update({ where: { id: slipId }, data: { status: "SELECTED", selectedQuotationId: quotationId, clientDecision: "accepted", acceptedQuotationId: quotationId, clientDecidedAt: new Date() } });
      await tx.policyRequest.update({ where: { id: slip.requestId }, data: { status: "AWARDED" } });
    });
    await this.audit.log({ tenantId, userId: clientId, action: "accept", entity: "proposal", entityId: slipId, meta: { quotationId, scope: "client" } });
    void this.notifications.notifyStaff(tenantId, "staff_proposal_accepted", { ref: String(slip.sequenceNo ?? slipId) }).catch(() => undefined);
    return { id: slipId, decision: "accepted", acceptedQuotationId: quotationId, requestStatus: "AWARDED" };
  }

  /** رفض العميل للعرض (بملاحظة) + إشعار الوسيط للمتابعة. */
  async declineProposal(tenantId: string, clientId: string, slipId: string, note?: string) {
    const slip = await this.ownedProposal(clientId, slipId);
    if (slip.clientDecision && slip.clientDecision !== "pending") throw new ConflictException("سبق اتخاذ قرار على هذا العرض");
    await this.prisma.slip.update({ where: { id: slipId }, data: { clientDecision: "declined", clientDecidedAt: new Date(), clientDecisionNote: note?.trim() || null } });
    await this.audit.log({ tenantId, userId: clientId, action: "decline", entity: "proposal", entityId: slipId, meta: { scope: "client" } });
    void this.notifications.notifyStaff(tenantId, "staff_proposal_declined", { ref: String(slip.sequenceNo ?? slipId) }).catch(() => undefined);
    return { id: slipId, decision: "declined" };
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
    // العميل يرى فواتير الرسوم الخاصة به فقط (kind=FEES) — لا فواتير عمولة الوسيط على المؤمِّن
    const invoices = await this.prisma.invoice.findMany({
      where: { clientId, kind: "FEES" },
      orderBy: { createdAt: "desc" },
      select: { id: true, sequenceNo: true, netAmount: true, vatAmount: true, totalAmount: true, status: true, createdAt: true },
    });
    const num = (v: unknown) => Number(v ?? 0);
    const charged = debitNotes.reduce((s, d) => s + num(d.netAmount) + num(d.vatAmount), 0);
    const collected = debitNotes.reduce((s, d) => s + num(d.settledAmount), 0);
    const credited = creditNotes.reduce((s, c) => s + num(c.netAmount) + num(c.vatAmount), 0);
    const outstanding = Math.round((charged - collected - credited) * 100) / 100;
    // جدول الأقساط (إن وُجدت خطة تقسيط) — بحالة كل قسط للعميل
    const insts = await this.prisma.installment.findMany({ where: { clientId }, orderBy: { dueDate: "asc" }, select: { id: true, seq: true, dueDate: true, amount: true, settledAmount: true } });
    const now = Date.now();
    const installments = insts.map((r) => {
      const amount = Number(r.amount);
      const settled = Number(r.settledAmount);
      const out = Math.round((amount - settled) * 100) / 100;
      const status = out <= 0.01 ? "paid" : settled > 0 ? "partial" : new Date(r.dueDate).getTime() < now ? "overdue" : "due";
      return { id: r.id, seq: r.seq, dueDate: r.dueDate, amount, settled: Math.round(settled * 100) / 100, outstanding: out, status };
    });
    // هل فعّلت شركة الوساطة الدفع الإلكتروني؟ (لعرض زرّ الدفع في البوّابة)
    const pay = await this.prisma.tenantPaymentSettings.findFirst({ select: { enabled: true } });
    const paymentEnabled = pay?.enabled ?? false;
    // إثراء الإشعارات المدينة بالمتبقّي لكل إشعار (أساس زرّ الدفع)
    const notes = debitNotes.map((d) => {
      const gross = Math.round((num(d.netAmount) + num(d.vatAmount)) * 100) / 100;
      const settled = Math.round(num(d.settledAmount) * 100) / 100;
      return { ...d, outstanding: Math.round((gross - settled) * 100) / 100 };
    });
    return { debitNotes: notes, creditNotes, invoices, outstanding, collected: Math.round(collected * 100) / 100, installments, paymentEnabled };
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
