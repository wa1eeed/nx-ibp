// عميل API بسيط للواجهة — يرفق توكن JWT من التخزين المحلي.
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const TOKEN_KEY = "ibp_token";

export function getToken(): string | null {
  return typeof window === "undefined" ? null : window.localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
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

export async function api<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
  });

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
