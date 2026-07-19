import { Body, Controller, Headers, HttpCode, Param, Post, UnauthorizedException } from "@nestjs/common";
import { WebhooksService } from "./webhooks.service";
import { CarrierEventDto } from "./dto/carrier-event.dto";
import { Public } from "../auth/public.decorator";

/**
 * وحدة استقبال أحداث المؤمِّنين (Carriers) — عامّة (بلا JWT)، مُصادَقة بالتوقيع فقط.
 * منفصلة تمامًا عن منطق الأعمال؛ تتحقّق ثم تُفوّض للخدمة (المعالجة اللاتزامنية).
 */
@Controller("webhooks")
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  /** استقبال حدث مؤمِّن (توقيع مطلوب). المؤمِّن في المسار (`tawuniya`/`bupa`/…). */
  @Public()
  @Post("carrier/:carrier")
  @HttpCode(200)
  async carrier(
    @Param("carrier") carrier: string,
    @Headers("x-carrier-signature") signature: string | undefined,
    @Body() dto: CarrierEventDto,
  ) {
    if (!this.webhooks.verifySignature(carrier, signature, dto)) {
      throw new UnauthorizedException("توقيع الحدث غير صالح");
    }
    return this.webhooks.handleCarrierEvent(carrier, dto);
  }
}
