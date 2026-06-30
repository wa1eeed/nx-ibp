import { createHash, createHmac } from "node:crypto";

/**
 * سائق تخزين متوافق مع S3 — بلا أي تبعية خارجية: توقيع AWS SigV4 يدويًا
 * (`node:crypto`) + `fetch` العام (Node 18+). يعمل مع AWS S3 وCloudflare R2
 * وMinIO وAlibaba OSS (واجهة S3 واحدة). يولّد **روابط موقّتة مباشِرة للدلو**
 * (Presigned URLs) للرفع/التنزيل دون مرور البايتات بالـ API، ويدعم عمليات
 * الخادم (put/get/head) للمستندات المولّدة خادميًا (مثل فواتير ZATCA).
 *
 * توليد الرابط الموقّت حتميّ ويُختبر دون شبكة؛ عمليات الشبكة عبر `fetch`.
 */
export interface S3Config {
  endpoint: string; // مثال: https://<acc>.r2.cloudflarestorage.com أو https://s3.me-central-1.amazonaws.com
  region: string; // "auto" لـ R2، أو إقليم AWS
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean; // path-style (R2/MinIO) مقابل virtual-hosted
}

const SERVICE = "s3";
const ALGO = "AWS4-HMAC-SHA256";
const UNSIGNED = "UNSIGNED-PAYLOAD";

/** ترميز RFC3986 (AWS): يُبقي A-Za-z0-9-_.~ فقط؛ `/` اختياري (يُبقى في المسار). */
function uriEncode(str: string, encodeSlash = true): string {
  return str.replace(/[^A-Za-z0-9_.~-]/g, (c) => {
    if (c === "/" && !encodeSlash) return c;
    return Array.from(Buffer.from(c, "utf8"))
      .map((b) => "%" + b.toString(16).toUpperCase().padStart(2, "0"))
      .join("");
  });
}

const sha256hex = (data: string | Buffer): string => createHash("sha256").update(data).digest("hex");
const hmac = (key: string | Buffer, data: string): Buffer => createHmac("sha256", key).update(data, "utf8").digest();

/** سلسلة مفتاح التوقيع SigV4: kDate→kRegion→kService→kSigning. */
function signingKey(secret: string, datestamp: string, region: string): Buffer {
  const kDate = hmac("AWS4" + secret, datestamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, SERVICE);
  return hmac(kService, "aws4_request");
}

/** طابعا الوقت: amzDate=YYYYMMDDTHHMMSSZ و datestamp=YYYYMMDD. */
function stamps(now: Date): { amzDate: string; datestamp: string } {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate, datestamp: amzDate.slice(0, 8) };
}

export class S3Signer {
  private readonly host: string;
  private readonly scheme: string;
  constructor(private readonly cfg: S3Config) {
    const u = new URL(cfg.endpoint);
    this.scheme = u.protocol.replace(":", "");
    this.host = cfg.forcePathStyle ? u.host : `${cfg.bucket}.${u.host}`;
  }

  /** مسار الكائن (path-style: /bucket/key، vhost: /key). كل جزء مُرمَّز مع إبقاء `/`. */
  private canonicalUri(key: string): string {
    const encKey = uriEncode(key, false);
    return this.cfg.forcePathStyle ? `/${uriEncode(this.cfg.bucket)}/${encKey}` : `/${encKey}`;
  }

  /**
   * رابط موقّت مباشر للدلو (توقيع عبر معاملات الاستعلام). الحِمل غير موقّع
   * (UNSIGNED-PAYLOAD) فيكفي العميل أن يرسل البايتات. `now` للحقن في الاختبار.
   */
  presign(method: "PUT" | "GET", key: string, expiresIn: number, now: Date = new Date()): string {
    const { amzDate, datestamp } = stamps(now);
    const scope = `${datestamp}/${this.cfg.region}/${SERVICE}/aws4_request`;
    const params: Record<string, string> = {
      "X-Amz-Algorithm": ALGO,
      "X-Amz-Credential": `${this.cfg.accessKeyId}/${scope}`,
      "X-Amz-Date": amzDate,
      "X-Amz-Expires": String(expiresIn),
      "X-Amz-SignedHeaders": "host",
    };
    const canonicalQuery = Object.keys(params)
      .sort()
      .map((k) => `${uriEncode(k)}=${uriEncode(params[k])}`)
      .join("&");
    const canonicalRequest = [method, this.canonicalUri(key), canonicalQuery, `host:${this.host}\n`, "host", UNSIGNED].join("\n");
    const stringToSign = [ALGO, amzDate, scope, sha256hex(canonicalRequest)].join("\n");
    const signature = hmac(signingKey(this.cfg.secretAccessKey, datestamp, this.cfg.region), stringToSign).toString("hex");
    return `${this.scheme}://${this.host}${this.canonicalUri(key)}?${canonicalQuery}&X-Amz-Signature=${signature}`;
  }

  /** طلب خادمي موقّع (header auth) لـ put/get/head. */
  async request(method: "PUT" | "GET" | "HEAD", key: string, body?: Buffer): Promise<Response> {
    const now = new Date();
    const { amzDate, datestamp } = stamps(now);
    const scope = `${datestamp}/${this.cfg.region}/${SERVICE}/aws4_request`;
    const payloadHash = sha256hex(body ?? "");
    const headers: Record<string, string> = { host: this.host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate };
    const signedHeaders = Object.keys(headers).sort().join(";");
    const canonicalHeaders = Object.keys(headers).sort().map((h) => `${h}:${headers[h]}\n`).join("");
    const canonicalRequest = [method, this.canonicalUri(key), "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
    const stringToSign = [ALGO, amzDate, scope, sha256hex(canonicalRequest)].join("\n");
    const signature = hmac(signingKey(this.cfg.secretAccessKey, datestamp, this.cfg.region), stringToSign).toString("hex");
    const authorization = `${ALGO} Credential=${this.cfg.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    // Node fetch يقبل Buffer حِملًا؛ نوع BodyInit غير متاح بلا lib.dom فنشتق توقيع fetch.
    const init = { method, headers: { ...headers, Authorization: authorization }, body } as Parameters<typeof fetch>[1];
    return fetch(`${this.scheme}://${this.host}${this.canonicalUri(key)}`, init);
  }
}

/** سائق تخزين S3 المتوافق — واجهة موحّدة تستهلكها StorageService. */
export class S3StorageDriver {
  readonly proxied = false; // الروابط مباشِرة للدلو (لا تمرّ بالـ API)
  private readonly signer: S3Signer;
  constructor(cfg: S3Config) {
    this.signer = new S3Signer(cfg);
  }

  presignPut(key: string, expiresIn: number): string {
    return this.signer.presign("PUT", key, expiresIn);
  }
  presignGet(key: string, expiresIn: number): string {
    return this.signer.presign("GET", key, expiresIn);
  }

  async put(key: string, data: Buffer): Promise<{ hash: string; size: number }> {
    const res = await this.signer.request("PUT", key, data);
    if (!res.ok) throw new Error(`S3 put فشل (${res.status})`);
    return { hash: createHash("sha256").update(data).digest("hex"), size: data.length };
  }

  async get(key: string): Promise<Buffer> {
    const res = await this.signer.request("GET", key);
    if (!res.ok) throw new Error(`S3 get فشل (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }

  async head(key: string): Promise<{ size: number; etag?: string }> {
    const res = await this.signer.request("HEAD", key);
    if (!res.ok) throw new Error(`S3 head فشل (${res.status})`);
    return {
      size: Number(res.headers.get("content-length") ?? 0),
      etag: res.headers.get("etag")?.replace(/"/g, "") ?? undefined,
    };
  }
}
