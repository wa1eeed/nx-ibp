import { ArrayNotEmpty, IsArray, IsString } from "class-validator";

/** إرسال طلب العرض (RFQ) بالبريد لشركات التأمين المختارة من السجلّ (بمعرّفاتها). */
export class SendRfqDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  insurerIds!: string[];
}
