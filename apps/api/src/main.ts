import "reflect-metadata";
import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import helmet from "helmet";
import { json, urlencoded } from "express";
import { AppModule } from "./app.module";

/**
 * يحمّل .env الجذر بالبحث صعوداً من مجلد العمل — يجب أن يسبق إنشاء التطبيق
 * (وبالتالي إنشاء PrismaClient الذي يقرأ process.env). في الحاويات تأتي
 * المتغيّرات من البيئة مباشرةً فلا يوجد ملف، وهذا مقبول.
 */
function loadRootEnv(): void {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const p = join(dir, ".env");
    if (existsSync(p)) {
      loadEnv({ path: p });
      return;
    }
    dir = join(dir, "..");
  }
}

async function bootstrap() {
  loadRootEnv();

  // نعطّل مُحلّل الجسم الافتراضي لنضبط حدوداً صريحة (منع هجمات الحمولة الكبيرة)
  const app = await NestFactory.create(AppModule, { bufferLogs: false, bodyParser: false });

  // حدّ حجم الجسم (لا رفع ملفات عبر الـ API — التخزين عبر روابط موقّتة مباشِرة للدلو)
  const BODY_LIMIT = process.env.API_BODY_LIMIT ?? "2mb";
  app.use(json({ limit: BODY_LIMIT }));
  app.use(urlencoded({ extended: true, limit: BODY_LIMIT }));

  // أمان: ترويسات HTTP آمنة + HSTS صريح (فرض HTTPS) + إخفاء بصمة الخادم
  app.use(
    helmet({
      hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    }),
  );
  // خلف وكيل عكسي (Coolify/موازِن) — يجعل req.ip عنوان العميل الحقيقي (لتحديد المعدّل الصحيح) + إخفاء البصمة
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set("trust proxy", 1);
  expressApp.disable("x-powered-by");

  // CORS من البيئة فقط (لا قيم صلبة)
  const origins = (process.env.CORS_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins, credentials: true });

  // التحقق من المدخلات على حدود الـ API (GUIDELINES.md §4)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableShutdownHooks();

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port, "0.0.0.0");
  Logger.log(`IBP API يعمل على http://localhost:${port} (health: /health)`, "Bootstrap");
}

bootstrap();
