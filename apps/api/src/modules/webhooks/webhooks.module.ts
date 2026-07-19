import { Module } from "@nestjs/common";
import { WebhooksController } from "./webhooks.controller";
import { WebhooksService } from "./webhooks.service";

/** مستقبِل موحّد لأحداث المؤمِّنين اللاتزامنية (Carrier Webhooks) بمصادقة توقيع. */
@Module({
  controllers: [WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule {}
