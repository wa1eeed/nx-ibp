// إعادة تصدير عميل Prisma المولّد (مخرج مخصّص) — بلا خطوة بناء.
// شغّل `pnpm --filter @ibp/db generate` أولاً لتوليد ./generated/client.
module.exports = require("./generated/client");
