import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { SlipsService } from "./slips.service";
import { CreateSlipDto } from "./dto/create-slip.dto";
import { CreateQuotationDto } from "./dto/create-quotation.dto";
import { SelectQuotationDto } from "./dto/select-quotation.dto";
import { Authorize } from "../rbac/authorize.decorator";
import { CurrentUser } from "../auth/current-user.decorator";

/**
 * الاكتتاب الفني — موديول production. الأدوار: مسؤول التسعير/إدارة الوثائق/المدير العام.
 */
@Controller("slips")
export class SlipsController {
  constructor(private readonly slips: SlipsService) {}

  @Authorize({ module: "production", action: "read", entitlement: "module.production" })
  @Get()
  list() {
    return this.slips.listSlips();
  }

  @Authorize({ module: "production", action: "create", entitlement: "module.production" })
  @Post()
  create(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("userId") userId: string,
    @Body() dto: CreateSlipDto,
  ) {
    return this.slips.createSlip(tenantId, userId, dto);
  }

  @Authorize({ module: "production", action: "read", entitlement: "module.production" })
  @Get(":id")
  getOne(@Param("id") id: string) {
    return this.slips.getSlip(id);
  }

  @Authorize({ module: "production", action: "read", entitlement: "module.production" })
  @Get(":id/comparison")
  comparison(@Param("id") id: string) {
    return this.slips.comparison(id);
  }

  @Authorize({ module: "production", action: "create", entitlement: "module.production" })
  @Post(":id/quotations")
  addQuotation(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("userId") userId: string,
    @Param("id") id: string,
    @Body() dto: CreateQuotationDto,
  ) {
    return this.slips.addQuotation(tenantId, userId, id, dto);
  }

  // أمر الإسناد (Firm Order)
  @Authorize({ module: "production", action: "update", entitlement: "module.production" })
  @HttpCode(200)
  @Post(":id/select")
  select(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("userId") userId: string,
    @Param("id") id: string,
    @Body() dto: SelectQuotationDto,
  ) {
    return this.slips.selectQuotation(tenantId, userId, id, dto.quotationId);
  }
}
