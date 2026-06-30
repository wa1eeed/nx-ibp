import { Module } from "@nestjs/common";
import { SignupService } from "./signup.service";
import { SignupController } from "./signup.controller";

/**
 * التسجيل الذاتي وتزويد المستأجر (المرحلة B1). كل التبعيات عالمية
 * (Prisma/Jwt/Audit/RequestContext/Security) فلا حاجة لاستيرادات.
 */
@Module({
  controllers: [SignupController],
  providers: [SignupService],
})
export class SignupModule {}
