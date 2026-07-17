import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { HttpCode } from "@nestjs/common";
import { PortalService } from "./portal.service";
import { PortalGuard } from "./portal.guard";
import { ConfigService } from "../config/config.service";
import { PaymentChargeService } from "../payments/payment-charge.service";
import { Public } from "../auth/public.decorator";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { PortalLoginDto, SubmitClaimDto, SubmitServiceDto, PortalServiceReplyDto, UpdateContactDto, ActivatePortalDto, AcceptProposalDto, DeclineProposalDto } from "./dto/portal.dto";
import { CreatePortalChargeDto } from "../payments/dto/payment-settings.dto";
import { Put } from "@nestjs/common";

/** بوّابة العميل — كل المسارات بنطاق `client` عدا الدخول. clientId يُشتقّ من التوكن. */
@UseGuards(PortalGuard)
@Controller("portal")
export class PortalController {
  constructor(
    private readonly portal: PortalService,
    private readonly config: ConfigService,
    private readonly charge: PaymentChargeService,
  ) {}

  @Public()
  @Post("login")
  login(@Body() dto: PortalLoginDto) {
    return this.portal.login(dto.email, dto.password);
  }

  // تفعيل حساب البوّابة عبر رابط الدعوة (عام — العميل لم يسجّل دخوله بعد)
  @Public()
  @Get("invite/:token")
  inviteInfo(@Param("token") token: string) {
    return this.portal.inviteInfo(token);
  }

  @Public()
  @HttpCode(200)
  @Post("activate")
  activate(@Body() dto: ActivatePortalDto) {
    return this.portal.activate(dto.token, dto.password);
  }

  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return this.portal.me(user.clientId!);
  }

  @Put("me")
  @HttpCode(200)
  updateContact(@CurrentUser() user: AuthUser, @Body() dto: UpdateContactDto) {
    return this.portal.updateContact(user.tenantId, user.clientId!, dto);
  }

  /** هوية شركة الوساطة (White-label) لتلوين بوّابة العميل. */
  @Get("branding")
  branding(@CurrentUser() user: AuthUser) {
    return this.config.getBranding(user.tenantId);
  }

  @Get("policies")
  policies(@CurrentUser() user: AuthUser) {
    return this.portal.policies(user.clientId!);
  }

  // ——— الخدمة الذاتية للعميل (تقديم مطالبة/طلب خدمة/تجديد) ———
  @HttpCode(201)
  @Post("claims")
  submitClaim(@CurrentUser() user: AuthUser, @Body() dto: SubmitClaimDto) {
    return this.portal.submitClaim(user.tenantId, user.clientId!, dto);
  }

  @HttpCode(201)
  @Post("service-requests")
  submitService(@CurrentUser() user: AuthUser, @Body() dto: SubmitServiceDto) {
    return this.portal.submitService(user.tenantId, user.clientId!, dto);
  }

  @HttpCode(201)
  @Post("policies/:id/renew")
  renew(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.portal.requestRenewal(user.tenantId, user.clientId!, id);
  }

  @Get("policies/:id")
  policyDetail(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.portal.policyDetail(user.clientId!, id);
  }

  @Get("requests")
  requests(@CurrentUser() user: AuthUser) {
    return this.portal.requests(user.clientId!);
  }

  @Get("service-requests/:id")
  serviceDetail(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.portal.serviceRequestDetail(user.clientId!, id);
  }

  @HttpCode(201)
  @Post("service-requests/:id/reply")
  serviceReply(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: PortalServiceReplyDto) {
    return this.portal.replyToService(user.tenantId, user.clientId!, user.userId, id, dto.body);
  }

  @Get("claims")
  claims(@CurrentUser() user: AuthUser) {
    return this.portal.claims(user.clientId!);
  }

  @Get("claims/:id")
  claimDetail(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.portal.claimDetail(user.clientId!, id);
  }

  @HttpCode(201)
  @Post("claims/:id/reply")
  claimReply(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: PortalServiceReplyDto) {
    return this.portal.replyToClaim(user.tenantId, user.clientId!, user.userId, id, dto.body);
  }

  @Get("statement")
  statement(@CurrentUser() user: AuthUser) {
    return this.portal.statement(user.clientId!);
  }

  // ——— عروض التأمين المقدَّمة للعميل + قراره (§4.1) ———
  @Get("proposals")
  proposals(@CurrentUser() user: AuthUser) {
    return this.portal.proposals(user.clientId!);
  }

  @Get("proposals/:id")
  proposalDetail(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.portal.proposalDetail(user.clientId!, id);
  }

  @HttpCode(200)
  @Post("proposals/:id/accept")
  acceptProposal(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: AcceptProposalDto) {
    return this.portal.acceptProposal(user.tenantId, user.clientId!, id, dto.quotationId);
  }

  @HttpCode(200)
  @Post("proposals/:id/decline")
  declineProposal(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: DeclineProposalDto) {
    return this.portal.declineProposal(user.tenantId, user.clientId!, id, dto.note);
  }

  // ——— الدفع الإلكتروني للأقساط/الذمم عبر بوّابة المستأجر (§2.2-ب) ———
  @HttpCode(201)
  @Post("pay")
  pay(@CurrentUser() user: AuthUser, @Body() dto: CreatePortalChargeDto) {
    return this.charge.createCharge(user.tenantId, user.clientId!, dto);
  }

  @HttpCode(200)
  @Post("pay/:id/confirm")
  payConfirm(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.charge.confirm(user.tenantId, user.clientId!, id);
  }

  @Get("notifications")
  notifications(@CurrentUser() user: AuthUser) {
    return this.portal.notifications_list(user.clientId!);
  }

  @Get("notifications/unread-count")
  notificationsUnread(@CurrentUser() user: AuthUser) {
    return this.portal.notificationsUnread(user.clientId!);
  }

  @Post("notifications/:id/read")
  @HttpCode(200)
  notificationRead(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.portal.notificationRead(user.clientId!, id);
  }

  @Get("documents")
  documents(@CurrentUser() user: AuthUser) {
    return this.portal.documents(user.clientId!);
  }

  @Get("documents/:id/url")
  @HttpCode(200)
  documentUrl(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.portal.documentUrl(user.tenantId, user.clientId!, id);
  }
}
