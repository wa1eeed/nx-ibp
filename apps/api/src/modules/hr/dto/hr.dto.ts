import { IsIn, IsISO8601, IsNumber, IsOptional, IsString, MaxLength } from "class-validator";

export const EMPLOYEE_DOC_TYPES = ["contract", "national_id", "iqama", "passport", "certificate", "other"] as const;

/** تحديث ملف الموارد البشرية للموظف — كل الحقول اختيارية (تحديث جزئي). */
export class UpdateEmployeeProfileDto {
  @IsOptional() @IsString() @MaxLength(120) jobTitle?: string;
  @IsOptional() @IsISO8601() hireDate?: string;
  @IsOptional() @IsISO8601() dateOfBirth?: string;
  @IsOptional() @IsString() @MaxLength(60) nationalId?: string; // يُشفَّر at-rest
  @IsOptional() @IsISO8601() nationalIdExpiry?: string;
  @IsOptional() @IsString() @MaxLength(60) nationality?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string; // يُشفَّر at-rest
  @IsOptional() @IsNumber() baseSalary?: number;
  @IsOptional() @IsString() @MaxLength(160) emergencyContact?: string;
  @IsOptional() @IsString() @MaxLength(240) addressLine?: string;
}

export class CreateEmployeeDocumentDto {
  @IsIn(EMPLOYEE_DOC_TYPES as unknown as string[]) type!: string;
  @IsString() @MaxLength(160) title!: string;
  @IsOptional() @IsString() @MaxLength(80) number?: string;
  @IsOptional() @IsISO8601() issueDate?: string;
  @IsOptional() @IsISO8601() expiryDate?: string;
  @IsOptional() @IsString() @MaxLength(500) fileUrl?: string;
}
