import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";

@Module({
  imports: [
    JwtModule.register({
      global: true, // JwtService متاح عالمياً (للـ middleware أيضاً)
      secret: process.env.JWT_SECRET ?? "dev-only-change-me",
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN ?? "15m" },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
