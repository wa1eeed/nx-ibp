import { Injectable } from "@nestjs/common";
import { isConfigured, providerEnv } from "../verification/verification.gateway";

/**
 * طبقة التكاملات التنظيمية. **جاهزة للإنتاج خلف seam** (§9.3): بوّابة التحقّق تُنادي الموفّرين
 * الفعليين عند `VERIFY_GATEWAY=live` + مفاتيح كل موفّر (BYO)، وإلا Sandbox (تراجُع آمن).
 * لوحة الحالة تعكس **جاهزية كل موصِّل فعليًا من البيئة** (`live` عند ضبط مفاتيحه، وإلا `sandbox`).
 */
@Injectable()
export class RegulatoryService {
  /** قائمة الموصِّلات التنظيمية وحالتها — الجاهزية مُشتقّة من مفاتيح البيئة لكل موصِّل. */
  status(env: NodeJS.ProcessEnv = process.env) {
    const liveMode = (env.VERIFY_GATEWAY ?? "").toLowerCase() === "live";
    // ما إذا كان موصِّل التحقّق مُهيّأً بمفاتيح فعلية (بادئة بيئته)
    const cfg = (prefix: string) => isConfigured(providerEnv(prefix, env));
    const envOf = (prefix: string, fallback = "sandbox") => (liveMode && cfg(prefix) ? "live" : fallback);
    const connectors = [
      { key: "zatca", name: "هيئة الزكاة والضريبة (ZATCA / Fatoora)", category: "invoicing", environment: "sandbox", status: "active", configured: true, note: "فاتورة إلكترونية — المرحلة 1 (QR/TLV) مُفعّلة" },
      { key: "nafath", name: "نفاذ (Nafath)", category: "auth", environment: envOf("NAFATH"), status: "active", configured: cfg("NAFATH"), note: "توثيق دخول العملاء" },
      { key: "yaqeen", name: "يقين (Yaqeen)", category: "identity", environment: envOf("YAQEEN"), status: "active", configured: cfg("YAQEEN"), note: "التحقّق من الهوية/الإقامة" },
      { key: "wathiq", name: "واثق (Wathiq)", category: "registry", environment: envOf("WATHIQ"), status: "active", configured: cfg("WATHIQ"), note: "السجل التجاري والمستفيد الحقيقي (UBO)" },
      { key: "spl", name: "العنوان الوطني (SPL)", category: "address", environment: envOf("SPL"), status: "active", configured: cfg("SPL"), note: "التحقّق من العنوان الوطني" },
      { key: "screening", name: "فحص PEP/العقوبات (Screening)", category: "compliance", environment: envOf("SCREENING"), status: "active", configured: cfg("SCREENING"), note: "تصنيف المخاطر" },
      { key: "ia", name: "هيئة التأمين (Insurance Authority)", category: "regulator", environment: "sandbox", status: "planned", configured: false, note: "رفع التقارير التنظيمية" },
    ];
    const liveCount = connectors.filter((c) => c.environment === "live").length;
    return {
      environment: liveCount > 0 ? "mixed" : "sandbox",
      gatewayMode: liveMode ? "live" : "sandbox", // VERIFY_GATEWAY
      dataResidency: "in-kingdom-production-only",
      connectors,
      summary: {
        total: connectors.length,
        active: connectors.filter((c) => c.status === "active").length,
        planned: connectors.filter((c) => c.status === "planned").length,
        live: liveCount,
      },
    };
  }
}
