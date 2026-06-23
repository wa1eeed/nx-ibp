import type { ReactNode } from "react";

export type StatTone = "primary" | "success" | "warning" | "danger" | "info";

const ICON_TONES: Record<StatTone, string> = {
  primary: "bg-primary-soft text-primary",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
};

export function StatCard({
  title,
  value,
  sub,
  icon,
  tone = "primary",
}: {
  title: string;
  value: ReactNode;
  sub?: ReactNode;
  icon: ReactNode;
  tone?: StatTone;
}) {
  return (
    <div className="rounded-card border border-line bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12.5px] text-muted">{title}</div>
          <div className="mt-1.5 text-2xl font-bold tracking-tight text-ink tnum">{value}</div>
        </div>
        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${ICON_TONES[tone]}`}>
          {icon}
        </div>
      </div>
      {sub ? <div className="mt-2 text-[11.5px] text-subtle">{sub}</div> : null}
    </div>
  );
}
