import { IsArray, IsBoolean, IsEmail, IsIn, IsString, MinLength, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { RBAC_MODULES } from "../../rbac/rbac.constants";

export class PermissionRowDto {
  @IsIn(RBAC_MODULES as unknown as string[])
  module!: string;

  @IsBoolean() canAccess!: boolean;
  @IsBoolean() canCreate!: boolean;
  @IsBoolean() canEdit!: boolean;
  @IsBoolean() canDelete!: boolean;
}

export class CreateStaffDto {
  @IsString()
  @MinLength(2)
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  /** اسم الدور المخصّص الذي يُنشأ من المصفوفة. */
  @IsString()
  @MinLength(2)
  roleName!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PermissionRowDto)
  permissions!: PermissionRowDto[];
}
