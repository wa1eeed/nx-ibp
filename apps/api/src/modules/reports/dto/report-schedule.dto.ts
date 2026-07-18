import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEmail, IsIn, IsOptional } from "class-validator";

/** التقارير المدعومة للجدولة (ملخّص إداري). */
export const SCHEDULE_REPORT_KEYS = ["dashboard", "commissions", "bordereau"] as const;
/** دورية الإرسال. */
export const SCHEDULE_FREQUENCIES = ["weekly", "monthly"] as const;

export class CreateReportScheduleDto {
  @IsIn(SCHEDULE_REPORT_KEYS as unknown as string[])
  reportKey!: string;

  @IsIn(SCHEDULE_FREQUENCIES as unknown as string[])
  frequency!: string;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20)
  @IsEmail({}, { each: true })
  recipients!: string[];
}

export class UpdateReportScheduleDto {
  @IsOptional() @IsIn(SCHEDULE_FREQUENCIES as unknown as string[])
  frequency?: string;

  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @IsEmail({}, { each: true })
  recipients?: string[];

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}
