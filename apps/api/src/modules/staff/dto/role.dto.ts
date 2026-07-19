import { IsArray, IsOptional, IsString, MinLength, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { PermissionRowDto } from "./create-staff.dto";

/** إنشاء دور مخصّص من مصفوفة الصلاحيات (محرّر RBAC). */
export class CreateRoleDto {
  @IsString() @MinLength(2) name!: string;

  @IsArray() @ValidateNested({ each: true }) @Type(() => PermissionRowDto)
  permissions!: PermissionRowDto[];
}

/** تعديل دور: الاسم و/أو مصفوفة الصلاحيات (أيّهما مُرسَل). */
export class UpdateRoleDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PermissionRowDto)
  permissions?: PermissionRowDto[];
}

/** إسناد دور لمستخدم. */
export class AssignRoleDto {
  @IsString() roleId!: string;
}
