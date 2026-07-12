import { IsIn, IsObject, IsOptional, IsString, MinLength, MaxLength } from "class-validator";

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
  @IsString() @MinLength(1) @MaxLength(1000) body!: string;
}
