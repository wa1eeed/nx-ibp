/**
 * اختبار محوّل الإشعارات الفعلي (Taqnyat SMS + Resend Email) — بناء الطلب دون شبكة.
 * يثبت: العناوين/المسارات/الحمولة الصحيحة + رفض غياب المفتاح.
 */
import { LiveNotificationGateway } from "../src/modules/notifications/notification.gateway";

const KEYS = ["RESEND_API_KEY", "NOTIFY_EMAIL_FROM", "TAQNYAT_API_KEY", "TAQNYAT_SENDER"];
function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const saved: Record<string, string | undefined> = {};
  for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  for (const [k, v] of Object.entries(vars)) if (v != null) process.env[k] = v;
  try { return fn(); } finally { for (const k of KEYS) { if (saved[k] == null) delete process.env[k]; else process.env[k] = saved[k]; } }
}

describe("محوّل الإشعارات الفعلي (dون شبكة)", () => {
  const g = new LiveNotificationGateway();

  it("Resend: طلب بريد سليم البنية", () =>
    withEnv({ RESEND_API_KEY: "re_test123", NOTIFY_EMAIL_FROM: "IBP <no-reply@brk.sa>" }, () => {
      const r = g.emailRequest({ channel: "email", to: "client@x.sa", subject: "إصدار وثيقتك", body: "تم الإصدار" });
      expect(r.url).toBe("https://api.resend.com/emails");
      expect(r.init.headers.Authorization).toBe("Bearer re_test123");
      const b = JSON.parse(r.init.body);
      expect(b.to).toEqual(["client@x.sa"]);
      expect(b.subject).toBe("إصدار وثيقتك");
      expect(b.text).toBe("تم الإصدار");
      expect(b.from).toContain("no-reply@brk.sa");
    }));

  it("Taqnyat: طلب SMS سليم البنية", () =>
    withEnv({ TAQNYAT_API_KEY: "tq_test123", TAQNYAT_SENDER: "GIB" }, () => {
      const r = g.smsRequest({ channel: "sms", to: "9665xxxxxxxx", body: "تم إصدار وثيقتك" });
      expect(r.url).toBe("https://api.taqnyat.sa/v1/messages");
      expect(r.init.headers.Authorization).toBe("Bearer tq_test123");
      const b = JSON.parse(r.init.body);
      expect(b.recipients).toEqual(["9665xxxxxxxx"]);
      expect(b.body).toBe("تم إصدار وثيقتك");
      expect(b.sender).toBe("GIB");
    }));

  it("غياب المفتاح ⇒ خطأ واضح", () => {
    withEnv({}, () => {
      expect(() => g.emailRequest({ channel: "email", to: "x@y.sa", body: "b" })).toThrow(/RESEND_API_KEY/);
      expect(() => g.smsRequest({ channel: "sms", to: "966", body: "b" })).toThrow(/TAQNYAT_API_KEY/);
    });
  });
});
