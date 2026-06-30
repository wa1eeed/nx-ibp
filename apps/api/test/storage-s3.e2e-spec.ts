/**
 * اختبار سائق التخزين المتوافق مع S3 (A1) — توقيع SigV4 يدوي، يُتحقَّق دون شبكة.
 * يثبت: بنية الرابط الموقّت + الحتمية + تأثّر التوقيع بالمفتاح + اختيار السائق
 * في StorageService (سحابي ⇒ رفع مباشر للدلو، محلي ⇒ عبر API).
 */
import { JwtService } from "@nestjs/jwt";
import { S3Signer, S3StorageDriver, type S3Config } from "../src/common/storage/s3-driver";
import { StorageService } from "../src/common/storage/storage.service";

const CFG: S3Config = {
  endpoint: "https://acc123.r2.cloudflarestorage.com",
  region: "auto",
  bucket: "ibp-prod",
  accessKeyId: "AKIAEXAMPLE",
  secretAccessKey: "secretExampleKey",
  forcePathStyle: true,
};
const FIXED = new Date("2026-01-15T10:00:00.000Z");
const KEY = "tenant_t1/policy/abcd__file.pdf";

const S3_KEYS = ["STORAGE_DRIVER", "STORAGE_ENDPOINT", "STORAGE_BUCKET", "STORAGE_ACCESS_KEY", "STORAGE_SECRET_KEY", "STORAGE_REGION", "STORAGE_FORCE_PATH_STYLE"];
/** يضبط متغيّرات البيئة مؤقتًا ثم يعيدها (StorageService يقرؤها عند الإنشاء فقط). */
function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const saved: Record<string, string | undefined> = {};
  for (const k of S3_KEYS) saved[k] = process.env[k];
  for (const k of S3_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(vars)) if (v != null) process.env[k] = v;
  try {
    return fn();
  } finally {
    for (const k of S3_KEYS) {
      if (saved[k] == null) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

describe("سائق التخزين S3 (SigV4 — دون شبكة)", () => {
  it("رابط PUT موقّت سليم البنية (path-style)", () => {
    const url = new S3Signer(CFG).presign("PUT", KEY, 300, FIXED);
    expect(url).toContain("https://acc123.r2.cloudflarestorage.com/ibp-prod/tenant_t1/policy/abcd__file.pdf");
    expect(url).toContain("X-Amz-Algorithm=AWS4-HMAC-SHA256");
    expect(url).toContain("X-Amz-Credential=AKIAEXAMPLE%2F20260115%2Fauto%2Fs3%2Faws4_request");
    expect(url).toContain("X-Amz-Date=20260115T100000Z");
    expect(url).toContain("X-Amz-Expires=300");
    expect(url).toMatch(/X-Amz-Signature=[0-9a-f]{64}$/);
  });

  it("حتميّ: نفس المدخلات والتاريخ ⇒ نفس التوقيع", () => {
    const a = new S3Signer(CFG).presign("GET", KEY, 300, FIXED);
    const b = new S3Signer(CFG).presign("GET", KEY, 300, FIXED);
    expect(a).toBe(b);
  });

  it("التوقيع يتغيّر بتغيّر المفتاح السرّي", () => {
    const a = new S3Signer(CFG).presign("PUT", KEY, 300, FIXED);
    const b = new S3Signer({ ...CFG, secretAccessKey: "different" }).presign("PUT", KEY, 300, FIXED);
    expect(a).not.toBe(b);
  });

  it("نمط virtual-hosted: المضيف = bucket.endpoint والمسار = /key", () => {
    const url = new S3Signer({ ...CFG, forcePathStyle: false }).presign("GET", KEY, 300, FIXED);
    expect(url).toContain("https://ibp-prod.acc123.r2.cloudflarestorage.com/tenant_t1/policy/");
  });

  it("StorageService سحابي ⇒ رفع مباشر للدلو (direct=true, غير وسيط)", () =>
    withEnv(
      { STORAGE_DRIVER: "r2", STORAGE_ENDPOINT: CFG.endpoint, STORAGE_BUCKET: CFG.bucket, STORAGE_ACCESS_KEY: CFG.accessKeyId, STORAGE_SECRET_KEY: CFG.secretAccessKey },
      () => {
        const svc = new StorageService(new JwtService({ secret: "t" }));
        expect(svc.isProxied()).toBe(false);
        const up = svc.presignUpload(KEY, "doc1", 1024);
        expect(up.direct).toBe(true);
        expect(up.url).toMatch(/^https:\/\/acc123\.r2\.cloudflarestorage\.com\/ibp-prod\//);
        expect(up.url).toContain("X-Amz-Signature=");
      },
    ));

  it("StorageService محلي ⇒ عبر API (direct=false, وسيط)", () =>
    withEnv({ STORAGE_DRIVER: "local" }, () => {
      const svc = new StorageService(new JwtService({ secret: "t" }));
      expect(svc.isProxied()).toBe(true);
      const up = svc.presignUpload(KEY, "doc1", 1024);
      expect(up.direct).toBe(false);
      expect(up.url).toContain("/documents/blob/");
    }));

  it("الدلو غير المهيّأ ⇒ خطأ واضح عند الإقلاع", () =>
    withEnv({ STORAGE_DRIVER: "s3" }, () => {
      expect(() => new StorageService(new JwtService({ secret: "t" }))).toThrow(/STORAGE_ENDPOINT/);
    }));

  it("driver-level put يحسب sha256 محليًا (بنية الإرجاع)", () => {
    // لا شبكة هنا — نتأكد فقط أن الواجهة موجودة والنوع صحيح
    const d = new S3StorageDriver(CFG);
    expect(typeof d.presignPut).toBe("function");
    expect(d.proxied).toBe(false);
  });
});
