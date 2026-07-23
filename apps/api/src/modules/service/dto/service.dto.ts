import { IsIn, IsObject, IsOptional, IsString, MinLength, MaxLength, IsEmail, IsArray } from "class-validator";

const PRIORITIES = ["low", "normal", "high", "urgent"] as const;

export class CreateServiceRequestDto {
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsString() policyId?: string;

  @IsIn(["addition", "deletion", "amendment", "inquiry", "renewal"])
  type!: string;

  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsIn(PRIORITIES) priority?: string;
  @IsOptional() @IsString() assigneeId?: string;
  @IsOptional() @IsObject() details?: Record<string, unknown>;
}

export class UpdateServiceStatusDto {
  @IsIn(["OPEN", "IN_PROGRESS", "SENT_TO_INSURER", "CLOSED"])
  status!: "OPEN" | "IN_PROGRESS" | "SENT_TO_INSURER" | "CLOSED";
}

export class AssignServiceDto {
  @IsOptional() @IsString() assigneeId?: string | null;
}

export class ServicePriorityDto {
  @IsIn(PRIORITIES) priority!: string;
}

export class ServiceNoteDto {
  @IsString() @MinLength(1) @MaxLength(2000) body!: string;
  /** internal = ملاحظة داخلية (موظفون فقط، الافتراضي) · client = رد ظاهر للعميل في البوّابة. */
  @IsOptional() @IsIn(["internal", "client"]) visibility?: "internal" | "client";
}

export class SendInsurerDto {
  @IsOptional() @IsEmail() to?: string; // بريد المستلِم (يتجاوز بريد سجلّ المؤمِّن)
  @IsOptional() @IsString() @MaxLength(200) subject?: string;
  @IsOptional() @IsString() @MaxLength(5000) body?: string;
  @IsOptional() @IsArray() @IsEmail({}, { each: true }) cc?: string[];
}
