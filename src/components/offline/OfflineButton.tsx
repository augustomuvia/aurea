"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Download, Loader2 } from "lucide-react";
import { downloadForOffline, isDownloaded, OFFLINE_EVENT, OfflineError, offlineSupported, type OfflineTrack } from "@/lib/offline";

type Track = Omit<OfflineTrack, "bytes" | "savedAt" | "until">;

const ERRORS: Record<OfflineError["code"], string> = {
  plan_required: "Descarregar é exclusivo dos planos Trimestral e Anual.",
  network: "A ligação falhou. Tente de novo com rede.",
  quota: "Sem espaço no telemóvel. Apague alguns downloads e tente de novo.",
  unsupported: "Este navegador não permite guardar áudio. Experimente o Safari ou o Chrome.",
};

/** "Descarregar para ouvir offline" (só aparece para áudios AUREA de planos que o incluem). */
export function OfflineButton({ track }: { track: Track }) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    setSupported(offlineSupported());
    const sync = () => setState((s) => (s === "busy" ? s : isDownloaded(track.contentId) ? "done" : "idle"));
    sync();
    window.addEventListener(OFFLINE_EVENT, sync);
    return () => window.removeEventListener(OFFLINE_EVENT, sync);
  }, [track.contentId]);

  if (!supported) return null;

  async function download() {
    setError(null);
    setState("busy");
    setProgress(0);
    try {
      await downloadForOffline(track, setProgress);
      setState("done");
    } catch (e) {
      setState("idle");
      setError(ERRORS[e instanceof OfflineError ? e.code : "network"]);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      {state === "done" ? (
        <Link href="/offline" className="press glass inline-flex h-12 items-center gap-2 rounded-full px-5 text-sm text-gold-light hover:text-paper">
          <Check className="h-4.5 w-4.5" /> Disponível offline
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => void download()}
          disabled={state === "busy"}
          className="press glass inline-flex h-12 items-center gap-2 rounded-full px-5 text-sm text-paper/85 hover:text-paper disabled:opacity-70"
        >
          {state === "busy" ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <Download className="h-4.5 w-4.5" />}
          {state === "busy" ? `A descarregar${progress ? ` ${Math.round(progress * 100)}%` : "…"}` : "Descarregar"}
        </button>
      )}
      {error && <p role="alert" className="max-w-xs text-xs text-danger">{error}</p>}
    </div>
  );
}
