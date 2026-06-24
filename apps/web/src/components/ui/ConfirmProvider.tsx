"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";

export type ConfirmTone = "primary" | "danger";
export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
}
type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmCtx = createContext<ConfirmFn | null>(null);

/** نافذة تأكيد موحّدة: تشرح الإجراء وتطلب تأكيداً أو إلغاءً قبل أي عملية مؤثّرة. */
export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmCtx);
  if (!fn) throw new Error("useConfirm يجب استخدامه داخل ConfirmProvider");
  return fn;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((o) => {
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = useCallback((v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setOpts(null);
  }, []);

  useEffect(() => {
    if (!opts) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
      if (e.key === "Enter") close(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [opts, close]);

  const danger = opts?.tone === "danger";

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {opts ? (
        <div
          className="fixed inset-0 z-[100] grid place-items-center bg-ink/40 p-4 backdrop-blur-sm"
          onMouseDown={() => close(false)}
          role="presentation"
        >
          <div
            role="alertdialog"
            aria-modal="true"
            className="w-full max-w-sm rounded-card border border-line bg-card p-5 shadow-card"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${danger ? "bg-danger-soft text-danger" : "bg-primary-soft text-primary"}`}>
                <AlertTriangle size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-[15px] font-bold text-ink">{opts.title}</h2>
                {opts.description ? <p className="mt-1 text-[13px] leading-relaxed text-muted">{opts.description}</p> : null}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => close(false)}
                className="rounded-lg border border-line bg-card px-4 py-2 text-[13px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink"
              >
                {opts.cancelLabel ?? t("confirm.cancel")}
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => close(true)}
                className={`rounded-lg px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 ${danger ? "bg-danger" : "bg-primary-strong"}`}
              >
                {opts.confirmLabel ?? t("confirm.confirm")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmCtx.Provider>
  );
}
