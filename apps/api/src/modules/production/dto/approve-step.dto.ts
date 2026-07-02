import { IsString, MinLength } from "class-validator";

/** جسم الموافقة على خطوة اعتماد إضافية مُهيّأة (E2). */
export class ApproveStepDto {
  @IsString() @MinLength(1)
  stepKey!: string;
}
