import { Logger } from "@nestjs/common";

/** سجلّ DNS يعيده Resend لتوثيق النطاق (SPF/DKIM/DMARC). */
export interface ResendDnsRecord {
  record?: string; // MX | TXT | CNAME
  name: string;
  type: string;
  ttl?: string;
  status?: string;
  value: string;
  priority?: number;
}

export interface ResendDomain {
  id: string;
  name: string;
  status: string; // not_started | pending | verified | failed | temporary_failure
  records: ResendDnsRecord[];
}

export interface HttpRequest {
  url: string;
  init: { method: string; headers: Record<string, string>; body?: string };
}

const apiBase = () => process.env.RESEND_API_URL ?? "https://api.resend.com";
const authHeaders = (key: string) => ({ Authorization: `Bearer ${key}`, "Content-Type": "application/json" });

// ————— بناء الطلبات (نقيّ، قابل للاختبار دون شبكة) —————

export function createDomainRequest(apiKey: string, name: string): HttpRequest {
  return { url: `${apiBase()}/domains`, init: { method: "POST", headers: authHeaders(apiKey), body: JSON.stringify({ name }) } };
}
export function getDomainRequest(apiKey: string, id: string): HttpRequest {
  return { url: `${apiBase()}/domains/${id}`, init: { method: "GET", headers: authHeaders(apiKey) } };
}
export function listDomainsRequest(apiKey: string): HttpRequest {
  return { url: `${apiBase()}/domains`, init: { method: "GET", headers: authHeaders(apiKey) } };
}
export function verifyDomainRequest(apiKey: string, id: string): HttpRequest {
  return { url: `${apiBase()}/domains/${id}/verify`, init: { method: "POST", headers: authHeaders(apiKey) } };
}
export function sendEmailRequest(apiKey: string, msg: { from: string; to: string; subject: string; html: string; text?: string; replyTo?: string }): HttpRequest {
  const body: Record<string, unknown> = { from: msg.from, to: [msg.to], subject: msg.subject, html: msg.html };
  if (msg.text) body.text = msg.text;
  if (msg.replyTo) body.reply_to = msg.replyTo;
  return { url: `${apiBase()}/emails`, init: { method: "POST", headers: authHeaders(apiKey), body: JSON.stringify(body) } };
}

/** يطبّع حالة نطاق Resend إلى حالتنا: verified | failed | pending. */
export function mapDomainStatus(resendStatus: string | undefined): "verified" | "failed" | "pending" {
  const s = (resendStatus ?? "").toLowerCase();
  if (s === "verified") return "verified";
  if (s === "failed" || s === "failure") return "failed";
  return "pending";
}

/**
 * عميل Resend (بلا SDK — fetch فقط). كل استدعاء يأخذ مفتاحه (مفتاح المستأجر لإدارة النطاق،
 * أو المفتاح المركزي للإرسال fallback). لا يُسجّل المفتاح أبدًا.
 */
export class ResendClient {
  private readonly logger = new Logger("ResendClient");

  private async exec<T>(req: HttpRequest): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
    try {
      const res = await fetch(req.url, req.init as Parameters<typeof fetch>[1]);
      const data = (await res.json().catch(() => null)) as T | null;
      if (!res.ok) {
        const msg = (data as { message?: string } | null)?.message ?? `HTTP ${res.status}`;
        return { ok: false, status: res.status, data: null, error: msg };
      }
      return { ok: true, status: res.status, data };
    } catch (e) {
      this.logger.warn(`فشل اتصال Resend: ${(e as Error).message}`);
      return { ok: false, status: 0, data: null, error: (e as Error).message };
    }
  }

  createDomain(apiKey: string, name: string) {
    return this.exec<ResendDomain>(createDomainRequest(apiKey, name));
  }
  getDomain(apiKey: string, id: string) {
    return this.exec<ResendDomain>(getDomainRequest(apiKey, id));
  }
  listDomains(apiKey: string) {
    return this.exec<{ data: ResendDomain[] }>(listDomainsRequest(apiKey));
  }
  verifyDomain(apiKey: string, id: string) {
    return this.exec<ResendDomain>(verifyDomainRequest(apiKey, id));
  }
  sendEmail(apiKey: string, msg: { from: string; to: string; subject: string; html: string; text?: string; replyTo?: string }) {
    return this.exec<{ id: string }>(sendEmailRequest(apiKey, msg));
  }
}
