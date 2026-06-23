import { IsEmail, IsIn, IsOptional, IsString, MinLength } from "class-validator";

export class CreateClientDto {
  @IsIn(["CORPORATE", "INDIVIDUAL"])
  type!: "CORPORATE" | "INDIVIDUAL";

  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional() @IsString() crNumber?: string;
  @IsOptional() @IsString() nationalId?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() nationalAddress?: string;
}
