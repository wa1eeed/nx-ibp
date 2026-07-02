import { IsArray, IsIn, IsOptional, IsString, MinLength, ValidateNested } from "class-validator";
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
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApprovalStepDto)
  steps!: ApprovalStepDto[];
}
