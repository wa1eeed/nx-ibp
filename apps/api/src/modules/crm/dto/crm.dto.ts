import { IsArray, IsDateString, IsIn, IsNumber, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

const STAGES = ["new", "contacted", "quoting", "proposal", "negotiation"];

/** حقول الفرصة البيعية المُثراة (Sales Lead) وفق معايير الوساطة — مشتركة بين الإنشاء والتعديل. */
class DealLeadFields {
  @IsOptional() @IsIn(["exclusive", "non_exclusive"]) exclusivity?: string;
  @IsOptional() @IsNumber() estimatedPremium?: number;
  @IsOptional() @IsDateString() expectedCloseDate?: string;
  @IsOptional() @IsIn(["direct", "producer"]) source?: string;
  @IsOptional() @IsString() @MaxLength(120) producerName?: string;
  @IsOptional() @IsString() @MaxLength(120) currentInsurer?: string;
  @IsOptional() @IsNumber() lossRatio?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) preferredInsurers?: string[];
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class CreateDealDto extends DealLeadFields {
  @IsString() @MinLength(2) title!: string;
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsIn(STAGES) stage?: string;
  @IsOptional() @IsNumber() value?: number;
  @IsOptional() @IsString() productLineCode?: string;
  @IsOptional() @IsString() assigneeId?: string;
}

export class UpdateDealDto extends DealLeadFields {
  @IsOptional() @IsString() @MinLength(2) title?: string;
  @IsOptional() @IsIn(STAGES) stage?: string;
  @IsOptional() @IsIn(["open", "won", "lost"]) status?: string;
  @IsOptional() @IsNumber() value?: number;
  @IsOptional() @IsString() productLineCode?: string;
  @IsOptional() @IsString() assigneeId?: string;
  @IsOptional() @IsString() lostReason?: string;
}

export class CreateTaskDto {
  @IsString() @MinLength(2) title!: string;
  @IsOptional() @IsString() assigneeId?: string;
  @IsOptional() @IsString() dueDate?: string;
  @IsOptional() @IsIn(["low", "normal", "high"]) priority?: string;
  @IsOptional() @IsString() entityType?: string;
  @IsOptional() @IsString() entityId?: string;
}

export class AddActivityDto {
  @IsString() entityType!: string;
  @IsString() entityId!: string;
  @IsOptional() @IsIn(["note", "call", "email", "meeting"]) type?: string;
  @IsString() @MinLength(1) body!: string;
}
