import { Controller, HttpCode, Param, Post } from "@nestjs/common";
import { RevertService } from "./revert.service";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";

/** التراجع خطوة للوراء (E4). الصلاحية ديناميكية (وحدة الكيان) ⇒ تُفحَص داخل الخدمة. */
@Controller("revert")
export class RevertController {
  constructor(private readonly revert: RevertService) {}

  @Post(":entityType/:id")
  @HttpCode(200)
  do(@CurrentUser() user: AuthUser, @Param("entityType") entityType: string, @Param("id") id: string) {
    return this.revert.revert(user, entityType, id);
  }
}
