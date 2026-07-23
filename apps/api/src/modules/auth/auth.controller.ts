import { Body, Controller, Get, HttpCode, Post } from "@nestjs/common";
import { IsString, MinLength } from "class-validator";
import { AuthService } from "./auth.service";
import { LoginDto, MfaCodeDto } from "./dto/login.dto";
import { Public } from "./public.decorator";
import { CurrentUser, type AuthUser } from "./current-user.decorator";

/** رمز تحديث الجلسة (للتدوير/الخروج). */
class RefreshDto {
  @IsString() @MinLength(16) refreshToken!: string;
}

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password, dto.mfaCode);
  }

  /** تدوير الجلسة: رمز تحديث صالح ⇒ رمز وصول + رمز تحديث جديدان (والقديم يُبطَل). */
  @Public()
  @HttpCode(200)
  @Post("refresh")
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  /** خروج: إبطال رمز التحديث. */
  @Public()
  @HttpCode(200)
  @Post("logout")
  logout(@Body() dto: RefreshDto) {
    return this.auth.logout(dto.refreshToken);
  }

  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.userId, user.impersonatorId);
  }

  // ——— المصادقة الثنائية (TOTP) للموظف ———
  @Get("mfa/status")
  mfaStatus(@CurrentUser() user: AuthUser) {
    return this.auth.mfaStatus(user.userId, user.tenantId);
  }

  @Post("mfa/setup")
  setupMfa(@CurrentUser() user: AuthUser) {
    return this.auth.setupMfa(user.userId);
  }

  @Post("mfa/enable")
  enableMfa(@CurrentUser() user: AuthUser, @Body() dto: MfaCodeDto) {
    return this.auth.enableMfa(user.userId, user.tenantId, dto.code);
  }

  @Post("mfa/disable")
  disableMfa(@CurrentUser() user: AuthUser, @Body() dto: MfaCodeDto) {
    return this.auth.disableMfa(user.userId, user.tenantId, dto.code);
  }
}
