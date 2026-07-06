"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Building2, Sparkles, Check, ArrowLeft, ArrowRight, Users, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import { api, setToken, ApiError } from "@/lib/api";

interface PublicPlan {
  code: string; name: string; seatLimit: number;
  pricePerUserMonthly: number; pricePerUserYearly: number; trialDays: number; savingsPct: number; modules: string[];
}

const onlyDigits = (s: string, max: number) => s.replace(/\D/g, "").slice(0, max);

export default function SignupPage() {
  const t = useTranslations("signup");
  const tg = useTranslations();
  const router = useRouter();
  const params = useSearchParams();

  const [step, setStep] = useState(1);
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [planCode, setPlanCode] = useState(params.get("plan") ?? "premium");
  const [yearly, setYearly] = useState(params.get("cycle") === "yearly");
  const [seatCount, setSeatCount] = useState(1);

  const [acc, setAcc] = useState({ companyName: "", companyNameEn: "", adminName: "", adminEmail: "", password: "" });
  const [ob, setOb] = useState({ unifiedNumber: "", vatNumber: "", phone: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { void api<PublicPlan[]>("/signup/plans").then((p) => { setPlans(p); if (!p.some((x) => x.code === planCode) && p[0]) setPlanCode(p[0].code); }).catch(() => undefined); }, [planCode]);

  const plan = useMemo(() => plans.find((p) => p.code === planCode) ?? null, [plans, planCode]);
  const perUser = plan ? (yearly ? plan.pricePerUserYearly : plan.pricePerUserMonthly) : 0;
  const total = perUser * Math.max(1, seatCount);
  const fmt = (n: number) => n.toLocaleString("en-US");

  const setA = (k: keyof typeof acc) => (e: { target: { value: string } }) => setAcc((f) => ({ ...f, [k]: e.target.value }));

  const strongPw = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(acc.password);
  const step1Valid = acc.companyName.trim().length >= 2 && acc.adminName.trim().length >= 2 && /.+@.+\..+/.test(acc.adminEmail) && strongPw;
  const unifiedValid = ob.unifiedNumber.length === 10;
  const phoneValid = /^05\d{8}$/.test(ob.phone);
  const vatValid = ob.vatNumber === "" || ob.vatNumber.length === 15;
  const seatValid = plan ? seatCount >= 1 && seatCount <= plan.seatLimit : false;
  const step2Valid = !!plan && seatValid && unifiedValid && phoneValid && vatValid;

  async function submit() {
    if (!step1Valid || !step2Valid) return;
    setLoading(true); setError("");
    try {
      const payload: Record<string, unknown> = {
        companyName: acc.companyName.trim(), adminName: acc.adminName.trim(), adminEmail: acc.adminEmail.trim(), password: acc.password,
        planCode, cycle: yearly ? "YEARLY" : "MONTHLY", seatCount,
        unifiedNumber: ob.unifiedNumber, phone: ob.phone,
      };
      if (acc.companyNameEn.trim()) payload.companyNameEn = acc.companyNameEn.trim();
      if (ob.vatNumber) payload.vatNumber = ob.vatNumber;
      const res = await api<{ accessToken: string }>("/signup", { method: "POST", body: JSON.stringify(payload) });
      setToken(res.accessToken);
      router.push("/tenant/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("error"));
      setStep(2);
    } finally { setLoading(false); }
  }

  const field = "h-10 w-full rounded-lg border border-line bg-card px-3 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-primary/30";
  const label = "mb-1 block text-[12.5px] font-medium text-muted";
  const digitField = (ok: boolean, val: string) => `${field} tnum ${val && !ok ? "border-danger ring-1 ring-danger/30" : ""}`;

  return (
    <div className="grid min-h-screen place-items-center bg-bg px-4 py-8">
      <div className="w-full max-w-lg rounded-card border border-line bg-card p-6 shadow-card">
        <div className="mb-4 flex flex-col items-center text-center">
          <div className="mb-2 grid h-11 w-11 place-items-center rounded-xl bg-primary text-primary-fg"><Building2 size={22} /></div>
          <h1 className="text-lg font-bold text-ink">{t("title")}</h1>
          <p className="text-[12.5px] text-subtle">{t("subtitle")}</p>
        </div>

        {/* مؤشّر الخطوات */}
        <div className="mb-5 flex items-center justify-center gap-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold ${step >= s ? "bg-primary-strong text-primary-fg" : "bg-surface-2 text-subtle"}`}>{step > s ? <Check size={13} /> : s}</div>
              {s < 3 ? <div className={`h-0.5 w-8 ${step > s ? "bg-primary-strong" : "bg-line"}`} /> : null}
            </div>
          ))}
        </div>

        {/* الخطوة 1 — الحساب */}
        {step === 1 ? (
          <div className="space-y-3">
            <label className="block"><span className={label}>{t("company")}</span><input value={acc.companyName} onChange={setA("companyName")} className={field} /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className={label}>{t("companyEn")}</span><input value={acc.companyNameEn} onChange={setA("companyNameEn")} dir="ltr" className={field} /></label>
              <label className="block"><span className={label}>{t("adminName")}</span><input value={acc.adminName} onChange={setA("adminName")} className={field} /></label>
            </div>
            <label className="block"><span className={label}>{t("email")}</span><input type="email" value={acc.adminEmail} onChange={setA("adminEmail")} dir="ltr" className={field} /></label>
            <label className="block"><span className={label}>{t("password")}</span><input type="password" value={acc.password} onChange={setA("password")} dir="ltr" className={field} /><span className={`mt-1 block text-[11px] ${acc.password && !strongPw ? "text-danger" : "text-subtle"}`}>{t("passwordHint")}</span></label>
            <button disabled={!step1Valid} onClick={() => { setError(""); setStep(2); }} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary-strong text-[13px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-50">{t("next")} <ArrowRight size={16} className="rtl:rotate-180" /></button>
          </div>
        ) : null}

        {/* الخطوة 2 — الباقة + المستخدمون + onboarding */}
        {step === 2 ? (
          <div className="space-y-4">
            {/* اختيار الباقة + تبديل شهري/سنوي */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className={label}>{t("plan")}</span>
                <div className="flex items-center gap-1.5 text-[11.5px]">
                  <button onClick={() => setYearly(false)} className={`rounded-md px-2 py-0.5 font-medium ${!yearly ? "bg-primary-soft text-primary-strong" : "text-subtle"}`}>{t("monthly")}</button>
                  <button onClick={() => setYearly(true)} className={`rounded-md px-2 py-0.5 font-medium ${yearly ? "bg-primary-soft text-primary-strong" : "text-subtle"}`}>{t("yearly")}</button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {plans.map((p) => {
                  const pu = yearly ? p.pricePerUserYearly : p.pricePerUserMonthly;
                  return (
                    <button key={p.code} onClick={() => { setPlanCode(p.code); if (seatCount > p.seatLimit) setSeatCount(p.seatLimit); }} className={`rounded-lg border p-2.5 text-start transition-colors ${planCode === p.code ? "border-primary ring-1 ring-primary/30 bg-primary/5" : "border-line hover:bg-surface-2"}`}>
                      <div className="text-[12.5px] font-bold text-ink">{t(`plan${p.code.charAt(0).toUpperCase()}${p.code.slice(1)}`)}</div>
                      <div className="text-[13px] font-bold text-primary-strong tnum">{fmt(pu)} <span className="text-[10px] font-normal text-subtle">{tg("common.sar")}</span></div>
                      <div className="text-[10px] text-subtle">{yearly ? t("perUserYr") : t("perUserMo")}</div>
                      {yearly && p.savingsPct > 0 ? <div className="mt-0.5 text-[10px] font-semibold text-success">−{p.savingsPct}%</div> : null}
                      {p.trialDays > 0 ? <div className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] font-semibold text-primary-strong"><Sparkles size={9} /> {p.trialDays}{t("daysShort")}</div> : null}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* عدد المستخدمين */}
            <label className="block">
              <span className={label}><Users size={12} className="inline" /> {t("seatCount")} {plan ? <span className="text-subtle">({t("upTo")} {plan.seatLimit})</span> : null}</span>
              <input type="number" min={1} max={plan?.seatLimit ?? 1} value={seatCount} onChange={(e) => setSeatCount(Math.max(1, Math.min(plan?.seatLimit ?? 1, Math.round(Number(e.target.value) || 1))))} className={`${field} tnum`} />
            </label>

            {/* onboarding — بيانات المنشأة (تحقّق بعدد الخانات) */}
            <div className="rounded-lg border border-line bg-surface-2/40 p-3">
              <div className="mb-2 text-[12px] font-semibold text-ink">{t("onboarding")}</div>
              <div className="space-y-2.5">
                <label className="block">
                  <span className={label}>{t("unifiedNumber")}</span>
                  <input value={ob.unifiedNumber} onChange={(e) => setOb((f) => ({ ...f, unifiedNumber: onlyDigits(e.target.value, 10) }))} inputMode="numeric" dir="ltr" maxLength={10} placeholder="7XXXXXXXXX" className={digitField(unifiedValid, ob.unifiedNumber)} />
                  <span className={`mt-0.5 block text-[10.5px] ${ob.unifiedNumber && !unifiedValid ? "text-danger" : "text-subtle"}`}>{t("unifiedHint")}</span>
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <label className="block">
                    <span className={label}>{t("vatNumber")}</span>
                    <input value={ob.vatNumber} onChange={(e) => setOb((f) => ({ ...f, vatNumber: onlyDigits(e.target.value, 15) }))} inputMode="numeric" dir="ltr" maxLength={15} placeholder="3XXXXXXXXXXXXXX" className={digitField(vatValid, ob.vatNumber)} />
                    <span className={`mt-0.5 block text-[10.5px] ${ob.vatNumber && !vatValid ? "text-danger" : "text-subtle"}`}>{t("vatHint")}</span>
                  </label>
                  <label className="block">
                    <span className={label}>{t("phone")}</span>
                    <input value={ob.phone} onChange={(e) => setOb((f) => ({ ...f, phone: onlyDigits(e.target.value, 10) }))} inputMode="numeric" dir="ltr" maxLength={10} placeholder="05XXXXXXXX" className={digitField(phoneValid, ob.phone)} />
                    <span className={`mt-0.5 block text-[10.5px] ${ob.phone && !phoneValid ? "text-danger" : "text-subtle"}`}>{t("phoneHint")}</span>
                  </label>
                </div>
              </div>
            </div>

            {error ? <p className="text-[12.5px] font-medium text-danger">{error}</p> : null}
            <div className="flex gap-2">
              <button onClick={() => setStep(1)} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-line px-4 text-[13px] font-medium text-muted hover:bg-surface-2"><ArrowLeft size={16} className="rtl:rotate-180" /> {t("back")}</button>
              <button disabled={!step2Valid} onClick={() => { setError(""); setStep(3); }} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-primary-strong text-[13px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-50">{t("next")} <ArrowRight size={16} className="rtl:rotate-180" /></button>
            </div>
          </div>
        ) : null}

        {/* الخطوة 3 — الملخّص والسعر (بتصميم تسويقي للتجربة) */}
        {step === 3 && plan ? (
          <div className="space-y-4">
            <div className="rounded-card border border-line bg-surface-2/40 p-4">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-muted">{t(`plan${plan.code.charAt(0).toUpperCase()}${plan.code.slice(1)}`)} · {yearly ? t("yearly") : t("monthly")}</span>
                <span className="font-medium text-ink tnum">{fmt(perUser)} {tg("common.sar")} {yearly ? t("perUserYr") : t("perUserMo")}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[13px]">
                <span className="text-muted">× {seatCount} {t("users")}</span>
                <span className="text-subtle tnum">{yearly ? t("perYr") : t("perMo")}</span>
              </div>
              <div className="my-3 border-t border-line" />

              {plan.trialDays > 0 ? (
                <div className="text-center">
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-[12.5px] font-bold text-primary-strong"><Sparkles size={13} /> {t("trialBadge", { days: plan.trialDays })}</div>
                  <div className="mt-2 flex items-end justify-center gap-2">
                    <span className="text-[15px] font-medium text-subtle line-through tnum">{fmt(total)}</span>
                    <span className="text-[28px] font-bold text-success">{t("free")}</span>
                  </div>
                  <p className="mt-1 text-[11.5px] text-subtle">{t("thenPrice", { amount: fmt(total), period: yearly ? t("perYr") : t("perMo") })}</p>
                </div>
              ) : (
                <div className="flex items-end justify-between">
                  <span className="text-[13px] font-semibold text-ink">{t("total")}</span>
                  <span className="text-[26px] font-bold text-ink tnum">{fmt(total)} <span className="text-[13px] font-normal text-subtle">{tg("common.sar")} {yearly ? t("perYr") : t("perMo")}</span></span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2 text-[11.5px] text-success"><ShieldCheck size={14} /> {t("noCard")}</div>

            {error ? <p className="text-[12.5px] font-medium text-danger">{error}</p> : null}
            <div className="flex gap-2">
              <button onClick={() => setStep(2)} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-line px-4 text-[13px] font-medium text-muted hover:bg-surface-2"><ArrowLeft size={16} className="rtl:rotate-180" /> {t("back")}</button>
              <button disabled={loading} onClick={submit} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-primary-strong text-[13px] font-semibold text-primary-fg hover:bg-primary disabled:opacity-60"><Sparkles size={16} /> {loading ? "…" : plan.trialDays > 0 ? t("startTrial") : t("submit")}</button>
            </div>
          </div>
        ) : null}

        <p className="mt-4 text-center text-[12px] text-subtle">{t("haveAccount")} <Link href="/login" className="font-semibold text-primary hover:underline">{t("loginLink")}</Link></p>
      </div>
    </div>
  );
}
