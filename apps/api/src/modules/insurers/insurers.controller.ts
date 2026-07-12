import { Body, Controller, Delete, Get, Param, Post, Put } from "@nestjs/common";
import { IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";
import { InsurersService } from "./insurers.service";
import { Authorize } from "../rbac/authorize.decorator";
import { CurrentUser } from "../auth/current-user.decorator";

class InsurerDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(120) nameEn?: string;
  @IsOptional() @IsString() @MaxLength(30) code?: string;
  @IsOptional() @IsString() @MaxLength(40) licenseNo?: string;
  @IsOptional() @IsString() @MaxLength(15) vatNumber?: string;
  @IsOptional() @IsString() @MaxLength(160) nationalAddress?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) commissionRate?: number;
  @IsOptional() @IsInt() @Min(0) @Max(365) settlementDays?: number;
  @IsOptional() @IsString() @MaxLength(80) bankName?: string;
  @IsOptional() @IsString() @MaxLength(34) iban?: string;
  @IsOptional() @IsString() @MaxLength(80) contactName?: string;
  @IsOptional() @IsEmail() contactEmail?: string;
  @IsOptional() @IsString() @MaxLength(20) contactPhone?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
  @IsOptional() @IsIn(["active", "inactive"]) status?: string;
}

/** إدارة شركات التأمين — تحت المالية (finance). */
@Controller("insurers")
export class InsurersController {
  constructor(private readonly insurers: InsurersService) {}

  @Authorize({ module: "finance", action: "read", entitlement: "module.finance" })
  @Get()
  list(@CurrentUser("tenantId") tenantId: string) {
    return this.insurers.list(tenantId);
  }

  @Authorize({ module: "finance", action: "create", entitlement: "module.finance" })
  @Post()
  create(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Body() dto: InsurerDto) {
    return this.insurers.create(tenantId, userId, dto);
  }

  @Authorize({ module: "finance", action: "update", entitlement: "module.finance" })
  @Put(":id")
  update(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Param("id") id: string, @Body() dto: InsurerDto) {
    return this.insurers.update(tenantId, userId, id, dto);
  }

  @Authorize({ module: "finance", action: "delete", entitlement: "module.finance" })
  @Delete(":id")
  remove(@CurrentUser("tenantId") tenantId: string, @CurrentUser("userId") userId: string, @Param("id") id: string) {
    return this.insurers.remove(tenantId, userId, id);
  }
}
