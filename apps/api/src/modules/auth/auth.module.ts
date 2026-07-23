import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { HrModule } from "../hr/hr.module";

@Module({
  imports: [
    HrModule, // لتسجيل الحضور تلقائيًا عند الدخول
    JwtModule.register({
      global: true, // JwtService متاح عالمياً (للـ middleware أيضاً)
      secret: process.env.JWT_SECRET ?? "dev-only-change-me",
      // جلسة عمل يوم كامل افتراضيًا (كان 15د — قصير جدًا يُخرج المستخدم عند الخمول). قابل للضبط بالبيئة.
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN ?? "8h" },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
