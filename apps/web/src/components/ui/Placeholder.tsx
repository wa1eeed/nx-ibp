import { Construction } from "lucide-react";

export function Placeholder({ title, body }: { title: string; body: string }) {
  return (
    <div className="grid min-h-[55vh] place-items-center">
      <div className="max-w-sm rounded-card border border-dashed border-line bg-card p-8 text-center shadow-card">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-primary-soft text-primary">
          <Construction size={24} />
        </div>
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{body}</p>
      </div>
    </div>
  );
}
