import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from "@nestjs/common";
import { HrService } from "./hr.service";
import { CreateEmployeeDocumentDto, UpdateEmployeeProfileDto } from "./dto/hr.dto";
import { Authorize } from "../rbac/authorize.decorator";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";

/**
 * الموارد البشرية — ملفّات الموظفين ووثائقهم. محكومة بصلاحية موديول `hr`.
 * البيانات الحسّاسة (الهوية/الجوال/الراتب) لا تُرى إلا لمن يملك `hr`.
 */
@Controller("hr")
export class HrController {
  constructor(private readonly hr: HrService) {}

  @Authorize({ module: "hr", action: "read" })
  @Get("expiring")
  expiring(@Query("days") days?: string) {
    return this.hr.expiring(days ? Number(days) : undefined);
  }

  @Authorize({ module: "hr", action: "read" })
  @Get("employees/:id/profile")
  profile(@Param("id") id: string) {
    return this.hr.profile(id);
  }

  @Authorize({ module: "hr", action: "update" })
  @Put("employees/:id/profile")
  updateProfile(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateEmployeeProfileDto) {
    return this.hr.updateProfile(user, id, dto);
  }

  @Authorize({ module: "hr", action: "read" })
  @Get("employees/:id/documents")
  documents(@Param("id") id: string) {
    return this.hr.documents(id);
  }

  @Authorize({ module: "hr", action: "create" })
  @Post("employees/:id/documents")
  addDocument(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: CreateEmployeeDocumentDto) {
    return this.hr.addDocument(user, id, dto);
  }

  @Authorize({ module: "hr", action: "delete" })
  @HttpCode(200)
  @Delete("documents/:id")
  deleteDocument(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.hr.deleteDocument(user, id);
  }
}
