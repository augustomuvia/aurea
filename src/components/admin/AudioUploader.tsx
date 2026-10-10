"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAudioUploadAction, setContentAudioAction } from "@/app/admin/actions";
import { createClient } from "@/lib/supabase/client";
import { CONTENT_AUDIO_BUCKET, CONTENT_AUDIO_MAX_BYTES } from "@/lib/audio";
import { buttonClass } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";

/** Alguns telemóveis e browsers não indicam o tipo do ficheiro: deduz pela extensão. */
function audioType(file: File): "audio/mpeg" | "audio/mp4" | "audio/x-m4a" | "audio/aac" | null {
  if (file.type === "audio/mpeg" || file.type === "audio/mp3" || /\.mp3$/i.test(file.name)) return "audio/mpeg";
  if (file.type === "audio/aac" || /\.aac$/i.test(file.name)) return "audio/aac";
  if (file.type === "audio/x-m4a" || /\.m4a$/i.test(file.name)) return "audio/x-m4a";
  if (file.type === "audio/mp4") return "audio/mp4";
  return null;
}

/**
 * Áudio próprio do conteúdo: o ficheiro vai do browser diretamente para o Storage
 * (privado) através de um URL assinado, sem passar pelo limite das ações do servidor.
 */
export function AudioUploader({ contentId, current }: { contentId: string; current: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<{ ok: boolean; error?: string; message?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function upload(file: File) {
    const type = audioType(file);
    if (!type) return setState({ ok: false, error: "Use um ficheiro MP3 ou M4A." });
    if (file.size > CONTENT_AUDIO_MAX_BYTES) return setState({ ok: false, error: "O ficheiro tem mais de 50 MB. Exporte em MP3 a 96–128 kbps." });
    setBusy(true);
    setState({ ok: true, message: "A enviar o áudio… não feche esta página." });
    try {
      const prep = await createAudioUploadAction({ contentId, fileName: file.name, type, size: file.size });
      if (!prep.ok || !prep.data) return setState(prep.ok ? { ok: false, error: "Não foi possível preparar o envio." } : prep);
      const { error } = await createClient().storage.from(CONTENT_AUDIO_BUCKET).uploadToSignedUrl(prep.data.path, prep.data.token, file, { contentType: type });
      if (error) return setState({ ok: false, error: "O envio falhou. Verifique a ligação e tente de novo." });
      const saved = await setContentAudioAction({ contentId, path: prep.data.path });
      setState(saved);
      if (saved.ok) startTransition(() => router.refresh());
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    if (!confirm("Remover o áudio? O conteúdo volta a tocar pelo YouTube.")) return;
    setBusy(true);
    const r = await setContentAudioAction({ contentId, path: null }).finally(() => setBusy(false));
    setState(r);
    if (r.ok) startTransition(() => router.refresh());
  }

  return (
    <div className="glass mt-5 space-y-4 p-6">
      <div>
        <h2 className="font-medium text-paper">Áudio próprio (ecrã bloqueado)</h2>
        <p className="mt-1 text-sm text-mute">
          Com um MP3 ou M4A, este conteúdo continua a tocar com o ecrã bloqueado ou fora do navegador, com controlos no ecrã de bloqueio. Use apenas áudio
          que criou ou que tem licença para usar. Sem ficheiro, toca pelo YouTube.
        </p>
      </div>
      <FormMessage state={state} />
      <p className="text-sm text-paper/80">{current ? "✓ Este conteúdo tem áudio próprio." : "Ainda sem áudio próprio."}</p>
      <div className="flex flex-wrap gap-3">
        <input
          ref={input}
          type="file"
          accept=".mp3,.m4a,.aac,audio/mpeg,audio/mp4,audio/x-m4a,audio/aac"
          className="sr-only"
          id={`audio-${contentId}`}
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
        <label htmlFor={`audio-${contentId}`} className={buttonClass("gold", "md", busy ? "pointer-events-none opacity-60" : "cursor-pointer")}>
          {busy ? "A enviar…" : current ? "Substituir áudio" : "Carregar áudio"}
        </label>
        {current && (
          <button type="button" onClick={remove} disabled={busy} className={buttonClass("ghost", "md")}>
            Remover áudio
          </button>
        )}
      </div>
    </div>
  );
}
