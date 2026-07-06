import { IsBoolean, IsObject, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateFormTemplateDto {
  @IsString() @MaxLength(120) name!: string;
  @IsString() @MaxLength(20) productLineCode!: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsObject() base!: Record<string, unknown>;
  @IsOptional() @IsObject() blocks?: Record<string, Array<Record<string, unknown>>>;
}

export class UpdateFormTemplateDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsOptional() @IsObject() base?: Record<string, unknown>;
  @IsOptional() @IsObject() blocks?: Record<string, Array<Record<string, unknown>>>;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
