import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from "@nestjs/common";
import { AmlService } from "./aml.service";
import { AssessRiskDto, ScreenDto, DisposeScreeningDto, CreateStrDto, UpdateStrDto } from "./dto/aml.dto";
import { Authorize } from "../rbac/authorize.decorator";
import { CurrentUser } from "../auth/current-user.decorator";

/** مكافحة غسل الأموال (AML/CFT) — §6.2، تحت صلاحية الالتزام (`compliance`). */
@Controller("aml")
export class AmlController {
  constructor(private readonly aml: AmlService) {}

  @Authorize({ module: "compliance", action: "read" })
  @Get("overview")
  overview() {
    return this.aml.overview();
  }

  @Authorize({ module: "compliance", action: "read" })
  @Get("report")
  report() {
    return this.aml.report();
  }

  // ── سجلّ العملاء + ملفّهم الرقابي ──────────────────────────────────────────
  @Authorize({ module: "compliance", action: "read" })
  @Get("clients")
  clients(@Query("level") level?: string) {
    return this.aml.clients({ level });
  }

  @Authorize({ module: "compliance", action: "read" })
  @Get("clients/:id")
  clientProfile(@Param("id") id: string) {
    return this.aml.clientProfile(id);
  }

  @Authorize({ module: "compliance", action: "update" })
  @HttpCode(201)
  @Post("clients/:id/assess")
  assess(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Param("id") id: string, @Body() dto: AssessRiskDto) {
    return this.aml.assess(tenantId, userId, id, dto);
  }

  // ── الفرز (العقوبات/PEP) ──────────────────────────────────────────────────
  @Authorize({ module: "compliance", action: "read" })
  @Get("screenings")
  screenings(@Query("clientId") clientId?: string) {
    return this.aml.screenings(clientId);
  }

  @Authorize({ module: "compliance", action: "update" })
  @HttpCode(201)
  @Post("screen")
  screen(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Body() dto: ScreenDto) {
    return this.aml.screen(tenantId, userId, dto);
  }

  @Authorize({ module: "compliance", action: "update" })
  @Put("screenings/:id/disposition")
  disposeScreening(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Param("id") id: string, @Body() dto: DisposeScreeningDto) {
    return this.aml.disposeScreening(tenantId, userId, id, dto);
  }

  // ── بلاغات الاشتباه (STR) ─────────────────────────────────────────────────
  @Authorize({ module: "compliance", action: "read" })
  @Get("reports")
  reports(@Query("status") status?: string) {
    return this.aml.reports(status);
  }

  @Authorize({ module: "compliance", action: "read" })
  @Get("reports/:id")
  reportDetail(@Param("id") id: string) {
    return this.aml.reportDetail(id);
  }

  @Authorize({ module: "compliance", action: "create" })
  @HttpCode(201)
  @Post("reports")
  createReport(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Body() dto: CreateStrDto) {
    return this.aml.createReport(tenantId, userId, dto);
  }

  @Authorize({ module: "compliance", action: "update" })
  @Put("reports/:id")
  updateReport(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Param("id") id: string, @Body() dto: UpdateStrDto) {
    return this.aml.updateReport(tenantId, userId, id, dto);
  }
}
