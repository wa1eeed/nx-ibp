import { IsIn, IsOptional, IsString } from "class-validator";

export class ComplianceDto {
  @IsIn(["APPROVED", "REJECTED"])
  decision!: "APPROVED" | "REJECTED";

  @IsOptional()
  @IsString()
  note?: string;
}
