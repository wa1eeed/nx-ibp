import { ArrayNotEmpty, IsArray, IsString } from "class-validator";

export class PresentProposalDto {
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) quotationIds!: string[];
}
