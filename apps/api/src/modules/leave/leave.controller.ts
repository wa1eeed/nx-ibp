import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { LeaveService } from "./leave.service";
import { CreateLeaveDto, DecideLeaveDto } from "./dto/leave.dto";
import { Authorize } from "../rbac/authorize.decorator";
import { CurrentUser } from "../auth/current-user.decorator";

/** §8.2 — طلبات إجازات الموظفين. التقديم/العرض الذاتي لأي موظف؛ العرض الكامل والبتّ للإدارة (`settings`). */
@Controller("leave")
export class LeaveController {
  constructor(private readonly leave: LeaveService) {}

  // ——— الموظف: طلباتي + تقديم (مصادقة فقط، بلا بوّابة وحدة) ———
  @Get("mine")
  mine(@CurrentUser("userId") userId: string) {
    return this.leave.mine(userId);
  }

  @Post()
  create(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Body() dto: CreateLeaveDto) {
    return this.leave.create(tenantId, userId, dto);
  }

  // ——— الإدارة: عرض الكل + البتّ ———
  @Authorize({ module: "settings", action: "read" })
  @Get()
  list(@Query("status") status?: string) {
    return this.leave.list(status);
  }

  @Authorize({ module: "settings", action: "update" })
  @Post(":id/decide")
  decide(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Param("id") id: string, @Body() dto: DecideLeaveDto) {
    return this.leave.decide(tenantId, userId, id, dto);
  }
}
