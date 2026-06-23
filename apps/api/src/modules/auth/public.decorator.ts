import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";

/** يعفي المسار من JwtAuthGuard العالمي (مثل تسجيل الدخول و/health). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
