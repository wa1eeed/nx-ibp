import { Module } from "@nestjs/common";
import { OrgService } from "./org.service";
import { OrgController } from "./org.controller";

/** الهيكل الإداري والأقسام (المرحلة C1). التبعيات عالمية (Prisma/Audit). */
@Module({
  controllers: [OrgController],
  providers: [OrgService],
})
export class OrgModule {}
