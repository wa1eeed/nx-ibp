import "reflect-metadata";
import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import helmet from "helmet";
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

  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  // أمان: ترويسات HTTP آمنة افتراضياً
  app.use(helmet());

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
