# متغيّرات البنية التحتية لـ IBP. حياديّ سحابياً — تُحقن القيم لكل مزوّد/بيئة.

variable "cloud" {
  description = "مزوّد السحابة: aws | gcp | alibaba"
  type        = string
  default     = "aws"
}

variable "region" {
  description = "المنطقة — يجب أن تكون داخل المملكة لبيئة الإنتاج (PDPL/NCA)."
  type        = string
  # أمثلة داخل المملكة: aws me-central-1 (الرياض) · gcp me-central2 · alibaba me-central-1
  default     = "me-central-1"
}

variable "environment" {
  description = "البيئة: dev | staging | production"
  type        = string
  default     = "production"
}

variable "db_instance_class" {
  description = "حجم قاعدة البيانات المُدارة (PostgreSQL)."
  type        = string
  default     = "db.r6g.large"
}

variable "enforce_in_kingdom" {
  description = "يمنع نشر الإنتاج خارج المملكة (تحقّق في main.tf)."
  type        = bool
  default     = true
}
