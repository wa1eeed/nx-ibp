# بنية IBP التحتية (هيكل حياديّ سحابياً). تُجسَّد الموارد لكل مزوّد عبر وحدات (modules)
# منفصلة؛ هذا الملف يفرض القواعد غير القابلة للتفاوض (التوطين داخل المملكة، التشفير).

terraform {
  required_version = ">= 1.6"
  # backend "s3" { ... } # حالة Terraform مشفّرة وموطّنة داخل المملكة.
}

locals {
  # مناطق معتمدة داخل المملكة لكل مزوّد (PDPL/NCA — بيانات الإنتاج داخل المملكة فقط).
  in_kingdom_regions = {
    aws      = ["me-central-1"]      # الرياض
    gcp      = ["me-central2"]       # الدمام
    alibaba  = ["me-central-1"]      # الرياض
  }
}

# حارس: يمنع نشر الإنتاج خارج المملكة.
resource "null_resource" "data_residency_guard" {
  count = var.enforce_in_kingdom && var.environment == "production" ? 1 : 0
  lifecycle {
    precondition {
      condition     = contains(local.in_kingdom_regions[var.cloud], var.region)
      error_message = "بيئة الإنتاج يجب أن تكون داخل المملكة (PDPL/NCA). المنطقة ${var.region} غير معتمدة للمزوّد ${var.cloud}."
    }
  }
}

# الوحدات (تُنفَّذ لكل مزوّد):
#   module "network"  — VPC خاصة + شبكات فرعية خاصة للحوسبة وقاعدة البيانات.
#   module "k8s"      — عنقود مُدار (EKS/GKE/ACK) لتشغيل infra/k8s.
#   module "database" — PostgreSQL مُدار، مشفّر at-rest، نسخ احتياطية موطّنة داخل المملكة.
#   module "cache"    — Redis مُدار (TLS).
#   module "storage"  — تخزين كائنات مشفّر (S3/GCS/OSS) + Presigned URLs.
#   module "secrets"  — مدير أسرار (لا أسرار في الكود).
#   module "logging"  — سجلّات وتدقيق موطّنة داخل المملكة.
# كل وحدة تستقبل var.cloud/var.region وتفرض: encryption at-rest + in-transit، نسخ احتياطية،
# والتوطين داخل المملكة. التكامل الحكومي (ZATCA/نفاذ/...) عبر نقاط الإنتاج فقط في هذه البيئة.
