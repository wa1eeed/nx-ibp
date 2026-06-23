// يحمّل .env الجذر قبل تحميل وحدات التطبيق (JwtModule يقرأ JWT_SECRET عند الاستيراد).
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { join } from "node:path";

let dir = process.cwd();
for (let i = 0; i < 6; i++) {
  const p = join(dir, ".env");
  if (existsSync(p)) {
    config({ path: p });
    break;
  }
  dir = join(dir, "..");
}
