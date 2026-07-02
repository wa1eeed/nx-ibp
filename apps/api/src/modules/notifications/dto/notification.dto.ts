import { IsBoolean, IsOptional, IsString, MinLength } from "class-validator";

export class UpdateNotificationDto {
  @IsBoolean() channelEmail!: boolean;
  @IsBoolean() channelSms!: boolean;
  @IsOptional() @IsString() subject?: string;
  @IsString() @MinLength(1) body!: string;
}
