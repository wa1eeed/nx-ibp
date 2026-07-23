import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from "@nestjs/common";
import { HrService } from "./hr.service";
import { AddChecklistItemDto, CreateEmployeeDocumentDto, ToggleChecklistDto, UpdateEmployeeProfileDto } from "./dto/hr.dto";
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

  // ————— الحضور والانصراف (خدمة ذاتية لكل موظف مصادَق — بلا بوّابة موديول) —————
  @Get("attendance/today")
  today(@CurrentUser("userId") userId: string) {
    return this.hr.today(userId);
  }

  @HttpCode(200)
  @Post("attendance/check-in")
  checkIn(@CurrentUser() user: AuthUser) {
    return this.hr.checkIn(user);
  }

  @HttpCode(200)
  @Post("attendance/check-out")
  checkOut(@CurrentUser() user: AuthUser) {
    return this.hr.checkOut(user);
  }

  @Get("attendance/mine")
  myAttendance(@CurrentUser("userId") userId: string, @Query("days") days?: string) {
    return this.hr.mine(userId, days ? Number(days) : undefined);
  }

  // لوحة حضور الفريق — للمديرين (صلاحية hr)
  @Authorize({ module: "hr", action: "read" })
  @Get("attendance/team")
  team(@Query("date") date?: string) {
    return this.hr.team(date);
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

  // ————— قوائم التعيين/الإنهاء (Onboarding/Offboarding) —————
  @Authorize({ module: "hr", action: "read" })
  @Get("employees/:id/checklist")
  checklist(@Param("id") id: string) {
    return this.hr.checklist(id);
  }

  @Authorize({ module: "hr", action: "update" })
  @HttpCode(200)
  @Post("checklist/:id/toggle")
  toggleChecklist(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: ToggleChecklistDto) {
    return this.hr.toggleChecklistItem(user, id, dto.done);
  }

  @Authorize({ module: "hr", action: "create" })
  @Post("employees/:id/checklist")
  addChecklist(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: AddChecklistItemDto) {
    return this.hr.addChecklistItem(user, id, dto.kind, dto.label);
  }

  @Authorize({ module: "hr", action: "delete" })
  @HttpCode(200)
  @Delete("checklist/:id")
  deleteChecklist(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.hr.deleteChecklistItem(user, id);
  }
}
