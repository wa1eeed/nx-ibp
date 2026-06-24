# infra/k8s — نشر Kubernetes

بيانات النشر لـ IBP. التطبيق:

```bash
kubectl apply -k infra/k8s
```

| الملف | المحتوى |
|---|---|
| `namespace.yaml` | مساحة `ibp` (موسومة `data-residency: in-kingdom`) |
| `configmap.yaml` | إعدادات غير سرّية للـ API |
| `secrets.example.yaml` | **قالب** الأسرار — تُحقن فعلياً من مدير الأسرار (External Secrets/CSI)، لا تُودَع في Git |
| `api.yaml` | نشر الـ API (3 نسخ) + خدمة + HPA (3→10) + فحوص صحّة `/health` + تقوية أمنية |
| `web.yaml` | نشر الواجهة (Next.js) + خدمة |
| `ingress.yaml` | توجيه + TLS (cert-manager): `app.ibp.sa` ⇒ الواجهة، `api.ibp.sa` ⇒ الـ API |
| `kustomization.yaml` | تجميع الموارد |

**ملاحظات:**
- قاعدة البيانات والكاش والتخزين **خدمات مُدارة** تُعرّف في [`../terraform`](../terraform) (لا داخل العنقود) لتسهيل التوطين والنسخ الاحتياطي داخل المملكة.
- التقوية: `runAsNonRoot`، `readOnlyRootFilesystem` (API)، إسقاط كل الـ capabilities، `allowPrivilegeEscalation: false`.
- الصور تُبنى من [`../docker`](../docker) ويُحقن وسمها من خط الإصدار.
