import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { HttpCode } from "@nestjs/common";
import { PortalService } from "./portal.service";
import { PortalGuard } from "./portal.guard";
import { Public } from "../auth/public.decorator";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { PortalLoginDto } from "./dto/portal.dto";

/** بوّابة العميل — كل المسارات بنطاق `client` عدا الدخول. clientId يُشتقّ من التوكن. */
@UseGuards(PortalGuard)
@Controller("portal")
export class PortalController {
  constructor(private readonly portal: PortalService) {}

  @Public()
  @Post("login")
  login(@Body() dto: PortalLoginDto) {
    return this.portal.login(dto.email, dto.password);
  }

  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return this.portal.me(user.clientId!);
  }

  @Get("policies")
  policies(@CurrentUser() user: AuthUser) {
    return this.portal.policies(user.clientId!);
  }

  @Get("requests")
  requests(@CurrentUser() user: AuthUser) {
    return this.portal.requests(user.clientId!);
  }

  @Get("claims")
  claims(@CurrentUser() user: AuthUser) {
    return this.portal.claims(user.clientId!);
  }

  @Get("statement")
  statement(@CurrentUser() user: AuthUser) {
    return this.portal.statement(user.clientId!);
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
