import { IsBoolean, IsOptional, IsString, MinLength } from "class-validator";

export class UpdateNotificationDto {
  @IsBoolean() channelEmail!: boolean;
  @IsBoolean() channelSms!: boolean;
  @IsOptional() @IsString() subject?: string;
  @IsString() @MinLength(1) body!: string;
}

/** ضبط تفضيل إشعار لدور معيّن (§9.1) — كتم/تفعيل نوع إشعار موظفين لدور. */
export class SetNotificationPreferenceDto {
  @IsString() @MinLength(1) roleId!: string;
  @IsString() @MinLength(1) eventKey!: string;
  @IsBoolean() enabled!: boolean;
}
