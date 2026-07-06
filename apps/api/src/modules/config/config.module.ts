import { Module } from "@nestjs/common";
import { ConfigController } from "./config.controller";
import { BrandingController } from "./branding.controller";
import { ConfigService } from "./config.service";

@Module({
  controllers: [ConfigController, BrandingController],
  providers: [ConfigService],
  exports: [ConfigService],
})
export class ConfigModule {}
