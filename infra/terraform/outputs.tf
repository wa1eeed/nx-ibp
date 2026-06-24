# مخرجات البنية (تُملأ عند تجسيد الوحدات لكل مزوّد).

output "region" {
  description = "منطقة النشر الفعلية (داخل المملكة للإنتاج)."
  value       = var.region
}

output "environment" {
  value = var.environment
}

# output "kubeconfig"   = module.k8s.kubeconfig
# output "database_url" = module.database.connection_string_secret_arn  # مرجع سرّ، لا القيمة
# output "storage_bucket" = module.storage.bucket_name
