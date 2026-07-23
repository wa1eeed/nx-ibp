import { Module } from "@nestjs/common";
import { VerificationController } from "./verification.controller";
import { VerificationService } from "./verification.service";
import { CrRegistryService } from "./cr-registry.service";
import { NotificationsModule } from "../notifications/notifications.module";
import { VERIFICATION_GATEWAY, makeVerificationGateway } from "./verification.gateway";

@Module({
  imports: [NotificationsModule],
  controllers: [VerificationController],
  providers: [
    VerificationService,
    CrRegistryService,
    { provide: VERIFICATION_GATEWAY, useFactory: () => makeVerificationGateway() },
  ],
  exports: [CrRegistryService],
})
export class VerificationModule {}
