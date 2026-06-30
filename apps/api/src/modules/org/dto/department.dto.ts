import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateDepartmentDto {
  @IsString()
  @MinLength(2, { message: "اسم القسم مطلوب" })
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  /** دور RBAC افتراضي يُطبَّق على من يُسند للقسم (قابل للتجاوز فرديًا). */
  @IsOptional()
  @IsString()
  defaultRoleId?: string;
}

export class UpdateDepartmentDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  parentId?: string | null;

  @IsOptional()
  @IsString()
  defaultRoleId?: string | null;
}

export class AssignUserDto {
  @IsString()
  userId!: string;

  @IsString()
  departmentId!: string;

  /** تجاوز فردي للدور؛ إن غاب طُبّق دور القسم الافتراضي. */
  @IsOptional()
  @IsString()
  roleId?: string;
}
