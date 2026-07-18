import { Module } from "@nestjs/common";
import { CoverNotesController } from "./cover-notes.controller";
import { CoverNotesService } from "./cover-notes.service";
import { NotificationsModule } from "../notifications/notifications.module";

/** مذكرة التغطية المؤقتة (§4.2 — تحت الإنتاج). */
@Module({
  imports: [NotificationsModule],
  controllers: [CoverNotesController],
  providers: [CoverNotesService],
  exports: [CoverNotesService],
})
export class CoverNotesModule {}
