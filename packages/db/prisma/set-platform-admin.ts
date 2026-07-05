/**
 * ضبط/تغيير سوبر أدمن المنصّة من متغيّرات البيئة — بلا إعادة بذر كامل.
 *
 * الاستخدام (على staging/production، من طرفية خدمة api أو عبر SSH):
 *   PLATFORM_ADMIN_PASSWORD=<كلمة مرور قوية> pnpm --filter @ibp/db admin:set
 * أو اضبط المتغيّرات في Coolify ثم شغّل `pnpm --filter @ibp/db admin:set`.
 *
 * المتغيّرات:
 *   PLATFORM_ADMIN_EMAIL     (اختياري) — البريد؛ الافتراضي admin@ibp-platform.sa
 *   PLATFORM_ADMIN_PASSWORD  (إلزامي) — ≥ 12 حرفًا
 *   PLATFORM_ADMIN_NAME      (اختياري) — الاسم المعروض
 *
 * يُنشئ الحساب إن لم يوجد، أو يُحدّث كلمة مروره (والاسم إن مُرِّر) إن وُجد.
 * لا يمسّ MFA (إن كانت مفعّلة تبقى). آمن للتشغيل المتكرّر.
 */
import { PrismaClient } from "../generated/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.PLATFORM_ADMIN_EMAIL ?? "admin@ibp-platform.sa").trim();
  const password = process.env.PLATFORM_ADMIN_PASSWORD;
  const name = process.env.PLATFORM_ADMIN_NAME?.trim();

  if (!password) throw new Error("PLATFORM_ADMIN_PASSWORD مطلوب (كلمة مرور سوبر أدمن المنصّة).");
  if (password.length < 12) throw new Error("PLATFORM_ADMIN_PASSWORD يجب ألا يقلّ عن 12 حرفًا.");

  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await prisma.platformAdmin.upsert({
    where: { email },
    update: { passwordHash, ...(name ? { fullName: name } : {}) },
    create: { email, fullName: name || "مالك المنصة", passwordHash },
  });
  console.log(`✅ ضُبطت كلمة مرور سوبر أدمن المنصّة: ${admin.email}`);
}

main()
  .catch((e) => {
    console.error("❌ فشل ضبط سوبر أدمن المنصّة:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
