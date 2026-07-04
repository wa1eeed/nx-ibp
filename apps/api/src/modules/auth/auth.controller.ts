import { Body, Controller, Get, Post } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { LoginDto, MfaCodeDto } from "./dto/login.dto";
import { Public } from "./public.decorator";
import { CurrentUser, type AuthUser } from "./current-user.decorator";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password, dto.mfaCode);
  }

  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.userId);
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
