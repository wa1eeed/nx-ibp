import { Controller, Get, Query } from "@nestjs/common";
import { SearchService } from "./search.service";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";

/**
 * البحث العام (⌘K) — مصادقة فقط؛ التصفية حسب الصلاحية تتمّ داخل الخدمة لكل نوع.
 */
@Controller("search")
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  find(@CurrentUser() user: AuthUser, @Query("q") q: string) {
    return this.search.search({ tenantId: user.tenantId, roleId: user.roleId }, q ?? "");
  }
}
