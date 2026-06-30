import { IsEmail, IsIn, IsOptional, IsString } from "class-validator";

/** بدء دفع اشتراك المنصّة. */
export class CheckoutDto {
  @IsString()
  planCode!: string; // basic | premium | enterprise

  @IsOptional()
  @IsIn(["MONTHLY", "YEARLY"])
  cycle?: "MONTHLY" | "YEARLY";

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsEmail()
  customerEmail?: string;
}
