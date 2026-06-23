import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // طبّق على كل المسارات عدا الـ API والملفات الثابتة
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
