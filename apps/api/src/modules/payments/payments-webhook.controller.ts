import { Body, Controller, HttpCode, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { PaymentChargeService } from "./payment-charge.service";
import { Public } from "../auth/public.decorator";

/** نقطة الـ webhook العامة لبوّابات الدفع (تُبلّغ نتيجة الدفع) — بلا مصادقة، بتحقّق توقيع. */
@Controller("payments")
export class PaymentsWebhookController {
  constructor(private readonly charge: PaymentChargeService) {}

  @Public()
  @HttpCode(200)
  @Post("webhook")
  webhook(@Req() req: Request, @Body() body: Record<string, unknown>) {
    const headers = req.headers as Record<string, string | undefined>;
    return this.charge.handleWebhook(headers, body ?? {});
  }
}
