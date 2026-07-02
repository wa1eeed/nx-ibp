import { Module } from "@nestjs/common";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";
import { StorageUsageService } from "./storage-usage.service";

@Module({
  controllers: [DocumentsController],
  providers: [DocumentsService, StorageUsageService],
})
export class DocumentsModule {}
