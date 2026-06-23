import { IsIn, IsObject, IsOptional, IsString } from "class-validator";

export class CreateServiceRequestDto {
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsString() policyId?: string;

  @IsIn(["addition", "deletion", "amendment", "inquiry", "renewal"])
  type!: string;

  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsObject() details?: Record<string, unknown>;
}

export class UpdateServiceStatusDto {
  @IsIn(["OPEN", "IN_PROGRESS", "SENT_TO_INSURER", "CLOSED"])
  status!: "OPEN" | "IN_PROGRESS" | "SENT_TO_INSURER" | "CLOSED";
}
