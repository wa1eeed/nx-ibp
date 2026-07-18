// عميل API بسيط للواجهة — يرفق توكن JWT من التخزين المحلي.
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const TOKEN_KEY = "ibp_token";
const PLATFORM_TOKEN_KEY = "ibp_platform_token";
const PORTAL_TOKEN_KEY = "ibp_portal_token";

export function getToken(): string | null {
  return typeof window === "undefined" ? null : window.localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}

// ----- توكن السوبر أدمن (لوحة المنصّة) -----
export function getPlatformToken(): string | null {
  return typeof window === "undefined" ? null : window.localStorage.getItem(PLATFORM_TOKEN_KEY);
}
export function setPlatformToken(token: string): void {
  window.localStorage.setItem(PLATFORM_TOKEN_KEY, token);
}
export function clearPlatformToken(): void {
  window.localStorage.removeItem(PLATFORM_TOKEN_KEY);
}

// ----- توكن بوّابة العميل -----
export function getPortalToken(): string | null {
  return typeof window === "undefined" ? null : window.localStorage.getItem(PORTAL_TOKEN_KEY);
}
export function setPortalToken(token: string): void {
  window.localStorage.setItem(PORTAL_TOKEN_KEY, token);
}
export function clearPortalToken(): void {
  window.localStorage.removeItem(PORTAL_TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** أخطاء تحقّق تفصيلية (من 422). */
    public details?: string[],
  ) {
    super(message);
  }
}

type Scope = "tenant" | "platform" | "portal";

export async function api<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
  return request<T>(path, opts, getToken(), "tenant");
}

/** نداء بنطاق المنصّة (السوبر أدمن). */
export async function papi<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
  return request<T>(path, opts, getPlatformToken(), "platform");
}

/** نداء بنطاق بوّابة العميل. */
export async function cpapi<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
  return request<T>(path, opts, getPortalToken(), "portal");
}

/**
 * انتهاء/بطلان الجلسة (401 مع توكن موجود) ⇒ نظّف التوكن وأعِد لصفحة الدخول المناسبة.
 * يمنع بقاء المستخدم في حالة معطوبة (قائمة فارغة/اسم افتراضي) بعد خمول التوكن.
 */
function handleSessionExpired(scope: Scope): void {
  if (typeof window === "undefined") return;
  const login = scope === "platform" ? "admin/login" : scope === "portal" ? "portal/login" : "login";
  if (scope === "platform") clearPlatformToken();
  else if (scope === "portal") clearPortalToken();
  else clearToken();
  const seg = window.location.pathname.split("/")[1];
  const locale = seg === "ar" || seg === "en" ? seg : "ar";
  if (!window.location.pathname.includes(`/${login}`)) window.location.replace(`/${locale}/${login}`);
}

async function request<T>(path: string, opts: RequestInit, token: string | null, scope: Scope = "tenant"): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
  });

  // جلسة منتهية: أُرسل توكن لكنه رُفض ⇒ إعادة توجيه نظيفة للدخول (لا نُظهر مستخدمًا آخر)
  if (res.status === 401 && token) handleSessionExpired(scope);

  if (!res.ok) {
    let message: string = res.statusText;
    let details: string[] | undefined;
    try {
      const body = (await res.json()) as { message?: string | string[]; errors?: string[] };
      if (body?.message) message = Array.isArray(body.message) ? body.message.join("، ") : body.message;
      if (Array.isArray(body?.errors)) details = body.errors;
    } catch {
      // لا جسم JSON
    }
    throw new ApiError(res.status, message, details);
  }

  return (res.status === 204 ? (undefined as T) : await res.json()) as T;
}

/** تنزيل ملفّ من الـ API (بترويسة المصادقة) وتشغيل حفظه في المتصفّح — للتصدير (CSV…). نطاق المستأجر. */
export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  if (res.status === 401 && token) handleSessionExpired("tenant");
  if (!res.ok) throw new ApiError(res.status, res.statusText);
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") ?? "";
  const name = cd.match(/filename="?([^"]+)"?/)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
