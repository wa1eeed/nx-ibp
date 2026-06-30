import { IsArray, IsBoolean, IsEmail, IsIn, IsString, Matches, MinLength, ValidateNested } from "class-validator";
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

  // سياسة كلمات المرور: 8 أحرف على الأقل تشمل حرفاً كبيراً وصغيراً ورقماً
  @IsString()
  @MinLength(8, { message: "كلمة المرور 8 أحرف على الأقل" })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, { message: "كلمة المرور يجب أن تحوي حرفاً كبيراً وصغيراً ورقماً" })
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
