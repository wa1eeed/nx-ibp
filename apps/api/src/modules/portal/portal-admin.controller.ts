import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { PortalService } from "./portal.service";
import { InvitePortalDto } from "./dto/portal.dto";
import { Authorize } from "../rbac/authorize.decorator";
import { CurrentUser } from "../auth/current-user.decorator";

/**
 * إدارة دخول بوّابة العميل من جهة الموظف (نطاق staff، صلاحية `clients`).
 * منفصل عن `PortalController` (نطاق `client`) — لا يخضع لـ`PortalGuard`.
 */
@Controller("clients")
export class PortalAdminController {
  constructor(private readonly portal: PortalService) {}

  @Authorize({ module: "clients", action: "read", entitlement: "module.clients" })
  @Get(":id/portal-users")
  list(@CurrentUser("tenantId") tenantId: string, @Param("id") clientId: string) {
    return this.portal.listPortalUsers(tenantId, clientId);
  }

  @Authorize({ module: "clients", action: "update", entitlement: "module.clients" })
  @HttpCode(201)
  @Post(":id/portal-invite")
  invite(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("userId") actorId: string,
    @Param("id") clientId: string,
    @Body() dto: InvitePortalDto,
  ) {
    return this.portal.invitePortalUser(tenantId, clientId, actorId, dto);
  }

  @Authorize({ module: "clients", action: "update", entitlement: "module.clients" })
  @HttpCode(200)
  @Post(":id/portal-users/:userId/revoke")
  revoke(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("userId") actorId: string,
    @Param("id") clientId: string,
    @Param("userId") userId: string,
  ) {
    return this.portal.revokePortalUser(tenantId, clientId, userId, actorId);
  }
}
