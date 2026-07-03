import { IsIn, IsNumber, IsOptional, IsString, MinLength } from "class-validator";

const STAGES = ["new", "contacted", "quoting", "proposal", "negotiation"];

export class CreateDealDto {
  @IsString() @MinLength(2) title!: string;
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsIn(STAGES) stage?: string;
  @IsOptional() @IsNumber() value?: number;
  @IsOptional() @IsString() productLineCode?: string;
  @IsOptional() @IsString() assigneeId?: string;
}

export class UpdateDealDto {
  @IsOptional() @IsString() @MinLength(2) title?: string;
  @IsOptional() @IsIn(STAGES) stage?: string;
  @IsOptional() @IsIn(["open", "won", "lost"]) status?: string;
  @IsOptional() @IsNumber() value?: number;
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
