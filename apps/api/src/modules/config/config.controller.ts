import { Body, Controller, Get, HttpCode, Post, Put } from "@nestjs/common";
import { IsArray, IsBoolean, IsEmail, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from "class-validator";
import { ConfigService, type ApprovalStep } from "./config.service";
import { SetApprovalChainDto } from "./dto/approval-chain.dto";
import { Authorize } from "../rbac/authorize.decorator";
import { CurrentUser } from "../auth/current-user.decorator";

class SetSecurityDto {
  @IsBoolean() mfaRequired!: boolean;
}

/** §6.4 — سياسات التشغيل: مدّة حق العدول (0–90 يومًا؛ 0 = مُعطَّل). */
class SetOperationsDto {
  @IsInt() @Min(0) @Max(90) freeLookDays!: number;
}

/** قالب طلب العرض (RFQ): موضوع/نصّ بعناصر نائبة + CC افتراضية. حقول فارغة ⇒ استعادة الافتراضي. */
class SetRfqTemplateDto {
  @IsOptional() @IsString() @MaxLength(300) subject?: string;
  @IsOptional() @IsString() @MaxLength(8000) body?: string;
  @IsOptional() @IsArray() @IsEmail({}, { each: true }) cc?: string[];
}

class SetRetentionDto {
  @IsInt() @Min(1) @Max(30) retentionYears!: number;
}

/** الهوية البصرية (White-label). كل الحقول اختيارية — يُحدَّث المُرسَل فقط. */
class SetBrandingDto {
  @IsOptional() @Matches(/^#([0-9a-fA-F]{6})$/, { message: "اللون بصيغة hex سداسية مثل #0d9488" }) primary?: string;
  @IsOptional() @IsString() @MaxLength(60) displayName?: string;
  @IsOptional() @IsString() @MaxLength(2048) logoUrl?: string;
  @IsOptional() @IsString() @MaxLength(2048) faviconUrl?: string;
  @IsOptional() @IsString() @MaxLength(24) logoText?: string;
}

/** رفع شعار (data URL base64 — حدّ ~700KB بعد الترميز). */
class UploadLogoDto {
  @IsString() @MaxLength(950_000) dataUrl!: string;
}

/** بيانات الشركة. كل الحقول اختيارية — يُحدَّث المُرسَل فقط. */
class SetCompanyDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(120) nameEn?: string;
  @IsOptional() @IsString() @MaxLength(30) crNumber?: string;
  @IsOptional() @IsString() @MaxLength(10) unifiedNumber?: string;
  @IsOptional() @IsString() @MaxLength(15) vatNumber?: string;
  @IsOptional() @IsString() @MaxLength(10) phone?: string;
  @IsOptional() @IsString() @MaxLength(10) buildingNo?: string;
  @IsOptional() @IsString() @MaxLength(120) street?: string;
  @IsOptional() @IsString() @MaxLength(80) district?: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @IsString() @MaxLength(10) postalCode?: string;
}

/** إعدادات المستأجر القابلة للتهيئة — سلسلة اعتماد الوثيقة (E2). تحت الإعدادات. */
@Controller("config")
export class ConfigController {
  constructor(private readonly config: ConfigService) {}

  @Authorize({ module: "settings", action: "read" })
  @Get("approval-chain")
  get(@CurrentUser("tenantId") tenantId: string) {
    return this.config.getPolicyApprovalConfig(tenantId).then((c) => ({ technicalGate: c.technicalGate, segregationOfDuties: c.segregationOfDuties, technicalSegregation: c.technicalSegregation, steps: c.extraSteps }));
  }

  @Authorize({ module: "settings", action: "update" })
  @Put("approval-chain")
  set(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Body() dto: SetApprovalChainDto) {
    return this.config.setPolicyApprovalConfig(tenantId, userId, { technicalGate: dto.technicalGate, segregationOfDuties: dto.segregationOfDuties, technicalSegregation: dto.technicalSegregation, steps: dto.steps as ApprovalStep[] });
  }

  // §6.4 — سياسات التشغيل (مدّة حق العدول)
  @Authorize({ module: "settings", action: "read" })
  @Get("operations")
  getOperations(@CurrentUser("tenantId") tenantId: string) {
    return this.config.getOperationsConfig(tenantId);
  }

  @Authorize({ module: "settings", action: "update" })
  @Put("operations")
  setOperations(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Body() dto: SetOperationsDto) {
    return this.config.setOperationsConfig(tenantId, userId, { freeLookDays: dto.freeLookDays });
  }

  // ——— سياسة الأمان (إلزام المصادقة الثنائية للموظفين) ———
  @Authorize({ module: "settings", action: "read" })
  @Get("security")
  getSecurity(@CurrentUser("tenantId") tenantId: string) {
    return this.config.getSecurityConfig(tenantId);
  }

  @Authorize({ module: "settings", action: "update" })
  @Put("security")
  setSecurity(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Body() dto: SetSecurityDto) {
    return this.config.setSecurityConfig(tenantId, userId, { mfaRequired: dto.mfaRequired });
  }

  // ——— قالب طلب العرض (RFQ) القابل للتخصيص ———
  @Authorize({ module: "settings", action: "read" })
  @Get("rfq-template")
  getRfqTemplate(@CurrentUser("tenantId") tenantId: string) {
    return this.config.getRfqTemplate(tenantId);
  }

  @Authorize({ module: "settings", action: "update" })
  @Put("rfq-template")
  setRfqTemplate(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Body() dto: SetRfqTemplateDto) {
    return this.config.setRfqTemplate(tenantId, userId, { subject: dto.subject, body: dto.body, cc: dto.cc });
  }

  // ——— بيانات الشركة ———
  @Authorize({ module: "settings", action: "read" })
  @Get("company")
  getCompany(@CurrentUser("tenantId") tenantId: string) {
    return this.config.getCompany(tenantId);
  }

  @Authorize({ module: "settings", action: "update" })
  @Put("company")
  setCompany(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Body() dto: SetCompanyDto) {
    return this.config.setCompany(tenantId, userId, dto);
  }

  // ——— الهوية البصرية (White-label — P0-B) ———
  @Authorize({ module: "settings", action: "read" })
  @Get("branding")
  getBranding(@CurrentUser("tenantId") tenantId: string) {
    return this.config.getBranding(tenantId);
  }

  @Authorize({ module: "settings", action: "update" })
  @Put("branding")
  setBranding(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Body() dto: SetBrandingDto) {
    return this.config.setBranding(tenantId, userId, dto);
  }

  @Authorize({ module: "settings", action: "update" })
  @HttpCode(200)
  @Post("branding/logo")
  uploadLogo(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Body() dto: UploadLogoDto) {
    return this.config.uploadLogo(tenantId, userId, dto.dataUrl);
  }

  // ——— سياسة الاحتفاظ بالبيانات (PDPL/الإتلاف الآمن) ———
  @Authorize({ module: "settings", action: "read" })
  @Get("retention")
  getRetention(@CurrentUser("tenantId") tenantId: string) {
    return this.config.getRetentionConfig(tenantId);
  }

  @Authorize({ module: "settings", action: "update" })
  @Put("retention")
  setRetention(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Body() dto: SetRetentionDto) {
    return this.config.setRetentionConfig(tenantId, userId, { retentionYears: dto.retentionYears });
  }
}
