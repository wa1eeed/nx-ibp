import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class IssueCoverNoteDto {
  @IsString() requestId!: string;
  @IsOptional() @IsInt() @Min(1) @Max(90) validityDays?: number;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
