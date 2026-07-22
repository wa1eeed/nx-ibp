-- إعدادات بوّابة دفع المنصّة (Tap لاشتراكات الوسطاء) — يديرها السوبر أدمن. صفّ مفرد.
CREATE TABLE "PlatformPaymentSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "provider" TEXT NOT NULL DEFAULT 'tap',
    "mode" TEXT NOT NULL DEFAULT 'test',
    "testPublicKey" TEXT,
    "testSecretKeyEncrypted" TEXT,
    "livePublicKey" TEXT,
    "liveSecretKeyEncrypted" TEXT,
    "merchantId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlatformPaymentSettings_pkey" PRIMARY KEY ("id")
);
