import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { COMPLAINT_CATEGORIES, COMPLAINT_SOURCES, COMPLAINT_STATUSES } from "../complaints.service";

const PRIORITIES = ["urgent", "high", "normal", "low"] as const;

export class CreateComplaintDto {
  @IsIn(COMPLAINT_CATEGORIES as unknown as string[]) category!: string;
  @IsIn(COMPLAINT_SOURCES as unknown as string[]) source!: string;
  @IsString() @MinLength(3) @MaxLength(200) subject!: string;
  @IsString() @MinLength(3) @MaxLength(4000) description!: string;
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsString() policyId?: string;
  @IsOptional() @IsIn(PRIORITIES as unknown as string[]) priority?: string;
  @IsOptional() @IsString() assigneeId?: string;
}

export class UpdateComplaintDto {
  @IsOptional() @IsIn(COMPLAINT_STATUSES as unknown as string[]) status?: string;
  @IsOptional() @IsString() assigneeId?: string | null;
  @IsOptional() @IsIn(PRIORITIES as unknown as string[]) priority?: string;
}

export class ResolveComplaintDto {
  @IsString() @MinLength(3) @MaxLength(4000) resolution!: string;
}

export class ComplaintNoteDto {
  @IsString() @MinLength(1) @MaxLength(2000) body!: string;
}
