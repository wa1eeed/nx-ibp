import { Module } from "@nestjs/common";
import { SearchController } from "./search.controller";
import { SearchService } from "./search.service";

/** البحث العام. PrismaService + PermissionService عالميّان (PrismaModule/RbacModule @Global). */
@Module({
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
