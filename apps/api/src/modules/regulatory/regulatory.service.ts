import { Injectable } from "@nestjs/common";

/**
 * طبقة التكاملات التنظيمية (المرحلة 9). في بيئة التطوير كلها عبر **Sandbox** فقط
 * (BLUEPRINT §7‑ب: لا APIs حكومية حقيقية خارج الإنتاج داخل المملكة).
 * تعرض حالة كل موصِّل ليُبنى فوقها التكامل الإنتاجي لاحقاً.
 */
@Injectable()
export class RegulatoryService {
  /** قائمة الموصِّلات التنظيمية وحالتها (Sandbox في التطوير). */
  status() {
    const connectors = [
      { key: "zatca", name: "هيئة الزكاة والضريبة (ZATCA / Fatoora)", category: "invoicing", environment: "sandbox", status: "active", note: "فاتورة إلكترونية — المرحلة 1 (QR/TLV) مُفعّلة" },
      { key: "nafath", name: "نفاذ (Nafath)", category: "auth", environment: "sandbox", status: "active", note: "توثيق دخول العملاء" },
      { key: "yaqeen", name: "يقين (Yaqeen)", category: "identity", environment: "sandbox", status: "active", note: "التحقّق من الهوية/الإقامة" },
      { key: "wathiq", name: "واثق (Wathiq)", category: "registry", environment: "sandbox", status: "active", note: "السجل التجاري والمستفيد الحقيقي (UBO)" },
      { key: "spl", name: "العنوان الوطني (SPL)", category: "address", environment: "sandbox", status: "active", note: "التحقّق من العنوان الوطني" },
      { key: "screening", name: "فحص PEP/العقوبات (Screening)", category: "compliance", environment: "sandbox", status: "active", note: "تصنيف المخاطر" },
      { key: "najm", name: "نجم (Najm)", category: "motor", environment: "sandbox", status: "planned", note: "تأمين المركبات — تكامل إنتاجي لاحقاً" },
      { key: "ncchi", name: "مجلس الضمان الصحي / نِفيس", category: "medical", environment: "sandbox", status: "planned", note: "التأمين الطبي" },
      { key: "ia", name: "هيئة التأمين (Insurance Authority)", category: "regulator", environment: "sandbox", status: "planned", note: "رفع التقارير التنظيمية" },
    ];
    return {
      environment: "sandbox",
      dataResidency: "in-kingdom-production-only",
      connectors,
      summary: {
        total: connectors.length,
        active: connectors.filter((c) => c.status === "active").length,
        planned: connectors.filter((c) => c.status === "planned").length,
      },
    };
  }
}
