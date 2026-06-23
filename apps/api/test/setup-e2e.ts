// يحمّل .env الجذر قبل تحميل وحدات التطبيق (JwtModule يقرأ JWT_SECRET عند الاستيراد).
// ثم يحمّل .env.test (إن وُجد) ليتجاوز DATABASE_URL → قاعدة اختبار منفصلة (ibp_test)
// كي لا تلوّث الاختبارات بيانات التطوير/العرض (ibp_dev).
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { join } from "node:path";

let dir = process.cwd();
for (let i = 0; i < 6; i++) {
  const base = join(dir, ".env");
  if (existsSync(base)) {
    config({ path: base });
    const testEnv = join(dir, ".env.test");
    if (existsSync(testEnv)) config({ path: testEnv, override: true });
    break;
  }
  dir = join(dir, "..");
}
