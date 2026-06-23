import { IsEmail, IsString } from "class-validator";

export class PortalLoginDto {
  @IsEmail() email!: string;
  @IsString() password!: string;
}
