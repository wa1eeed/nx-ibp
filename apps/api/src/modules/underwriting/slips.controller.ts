import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { SlipsService } from "./slips.service";
import { CreateSlipDto } from "./dto/create-slip.dto";
import { CreateQuotationDto } from "./dto/create-quotation.dto";
import { SelectQuotationDto } from "./dto/select-quotation.dto";
import { PresentProposalDto } from "./dto/present-proposal.dto";
import { SendRfqDto } from "./dto/send-rfq.dto";
import { Authorize } from "../rbac/authorize.decorator";
import { CurrentUser } from "../auth/current-user.decorator";

/**
 * الاكتتاب الفني — موديول production. الأدوار: مسؤول التسعير/إدارة الوثائق/المدير العام.
 */
@Controller("slips")
export class SlipsController {
  constructor(private readonly slips: SlipsService) {}

  @Authorize({ module: "underwriting", action: "read", entitlement: "module.production" })
  @Get()
  list() {
    return this.slips.listSlips();
  }

  @Authorize({ module: "underwriting", action: "create", entitlement: "module.production" })
  @Post()
  create(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("userId") userId: string,
    @Body() dto: CreateSlipDto,
  ) {
    return this.slips.createSlip(tenantId, userId, dto);
  }

  @Authorize({ module: "underwriting", action: "read", entitlement: "module.production" })
  @Get(":id")
  getOne(@Param("id") id: string) {
    return this.slips.getSlip(id);
  }

  @Authorize({ module: "underwriting", action: "read", entitlement: "module.production" })
  @Get(":id/comparison")
  comparison(@Param("id") id: string) {
    return this.slips.comparison(id);
  }

  @Authorize({ module: "underwriting", action: "create", entitlement: "module.production" })
  @Post(":id/quotations")
  addQuotation(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("userId") userId: string,
    @Param("id") id: string,
    @Body() dto: CreateQuotationDto,
  ) {
    return this.slips.addQuotation(tenantId, userId, id, dto);
  }

  // الصيغة الافتراضية (موضوع + نصّ) لعرضها للموظف كي يعدّلها قبل الإرسال
  @Authorize({ module: "underwriting", action: "read", entitlement: "module.production" })
  @Get(":id/rfq-template")
  rfqTemplate(@CurrentUser("tenantId") tenantId: string, @Param("id") id: string) {
    return this.slips.rfqTemplate(tenantId, id);
  }

  // الطبقة ١ — إرسال طلب العرض (RFQ): موضوع/نصّ قابلان للتعديل + CC + معاينة قبل الإرسال
  @Authorize({ module: "underwriting", action: "create", entitlement: "module.production" })
  @HttpCode(200)
  @Post(":id/send-rfq")
  sendRfq(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("userId") userId: string,
    @Param("id") id: string,
    @Body() dto: SendRfqDto,
  ) {
    return this.slips.sendRfq(tenantId, userId, id, dto.recipients, { subject: dto.subject, body: dto.body, cc: dto.cc });
  }

  // أمر الإسناد (Firm Order)
  @Authorize({ module: "underwriting", action: "update", entitlement: "module.production" })
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

  // عرض العروض المنتقاة على العميل عبر البوّابة (§4.1)
  @Authorize({ module: "underwriting", action: "update", entitlement: "module.production" })
  @HttpCode(200)
  @Post(":id/present")
  present(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("userId") userId: string,
    @Param("id") id: string,
    @Body() dto: PresentProposalDto,
  ) {
    return this.slips.present(tenantId, userId, id, dto.quotationIds);
  }
}
