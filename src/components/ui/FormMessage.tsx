import { AlertCircle, CheckCircle2 } from "lucide-react";

export function FormMessage({ state }: { state: { ok: boolean; error?: string; message?: string } | null | undefined }) {
  if (!state) return null;
  if (state.ok && !state.message) return null;
  const ok = state.ok;
  return (
    <div
      role={ok ? "status" : "alert"}
      className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm animate-fade ${
        ok ? "border-ok/25 bg-ok/[0.06] text-ok" : "border-danger/30 bg-danger/[0.07] text-danger"
      }`}
    >
      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
      <span>{ok ? state.message : state.error}</span>
    </div>
  );
}
