import { IsArray, IsBoolean, IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { SCREENING_DISPOSITIONS, STR_INDICATORS, STR_STATUSES } from "../aml.service";

export class AssessRiskDto {
  @IsObject() factors!: Record<string, boolean>;
  @IsOptional() @IsString() @MaxLength(2000) rationale?: string;
}

export class ScreenDto {
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsString() @MaxLength(200) name?: string;
}

export class DisposeScreeningDto {
  @IsIn(SCREENING_DISPOSITIONS as unknown as string[]) disposition!: string;
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}

export class CreateStrDto {
  @IsOptional() @IsString() clientId?: string;
  @IsString() @MinLength(3) @MaxLength(200) subject!: string;
  @IsString() @MinLength(3) @MaxLength(4000) description!: string;
  @IsArray() @IsIn(STR_INDICATORS as unknown as string[], { each: true }) indicators!: string[];
  @IsOptional() @IsBoolean() fileNow?: boolean;
  @IsOptional() @IsString() @MaxLength(200) reference?: string;
}

export class UpdateStrDto {
  @IsOptional() @IsIn(STR_STATUSES as unknown as string[]) status?: string;
  @IsOptional() @IsString() @MaxLength(200) reference?: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
}
