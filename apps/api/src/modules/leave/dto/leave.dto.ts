import { IsDateString, IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export const LEAVE_TYPES = ["annual", "sick", "unpaid", "other"] as const;

export class CreateLeaveDto {
  @IsIn(LEAVE_TYPES as unknown as string[]) type!: string;
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class DecideLeaveDto {
  @IsIn(["approved", "rejected"]) status!: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
