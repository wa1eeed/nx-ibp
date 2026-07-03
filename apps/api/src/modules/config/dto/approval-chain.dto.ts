import { IsArray, IsBoolean, IsIn, IsOptional, IsString, MinLength, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { RBAC_MODULES } from "../../rbac/rbac.constants";

export class ApprovalStepDto {
  @IsString() @MinLength(1)
  key!: string;

  @IsString() @MinLength(1)
  name!: string;

  @IsIn(RBAC_MODULES as unknown as string[])
  module!: string;

  @IsOptional() @IsIn(["read", "create", "update", "delete"])
  action?: string;
}

export class SetApprovalChainDto {
  /** بوّابة الموافقة الفنية — قابلة للتعطيل (افتراضي مفعّلة). */
  @IsOptional() @IsBoolean()
  technicalGate?: boolean;

  /** فصل المهام (المعتمِد المالي ≠ المُصدِر) — توصية رقابية، افتراضي مفعّل. */
  @IsOptional() @IsBoolean()
  segregationOfDuties?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApprovalStepDto)
  steps!: ApprovalStepDto[];
}
