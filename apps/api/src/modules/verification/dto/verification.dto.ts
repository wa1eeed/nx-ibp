import { IsOptional, IsString, MinLength } from "class-validator";

export class YaqeenDto {
  @IsString() @MinLength(10) nationalId!: string;
  @IsOptional() @IsString() clientId?: string;
}

export class WathiqDto {
  @IsString() @MinLength(7) crNumber!: string;
  @IsOptional() @IsString() clientId?: string;
}

export class AddressDto {
  @IsString() @MinLength(7) id!: string;
  @IsOptional() @IsString() clientId?: string;
}

export class ScreeningDto {
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsString() clientId?: string;
}

export class CrRegistryDto {
  @IsString() @MinLength(4) crNumber!: string;
  @IsOptional() @IsString() clientId?: string;
}
