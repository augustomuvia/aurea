"use client";
import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { createAudioContentAction, discardAudioContentAction, finishAudioContentAction } from "@/app/admin/actions";
import { createClient } from "@/lib/supabase/client";
import { CONTENT_AUDIO_BUCKET, CONTENT_AUDIO_MAX_BYTES, titleFromFileName } from "@/lib/audio";
import { buttonClass } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";

type Row = { file: File; title: string; state: "waiting" | "sending" | "done" | "error"; message?: string; contentId?: string };

function audioType(file: File): "audio/mpeg" | "audio/mp4" | "audio/x-m4a" | "audio/aac" | null {
  if (file.type === "audio/mpeg" || file.type === "audio/mp3" || /\.mp3$/i.test(file.name)) return "audio/mpeg";
  if (file.type === "audio/aac" || /\.aac$/i.test(file.name)) return "audio/aac";
  if (file.type === "audio/x-m4a" || /\.m4a$/i.test(file.name)) return "audio/x-m4a";
  if (file.type === "audio/mp4") return "audio/mp4";
  return null;
}

/** Lê a duração no próprio browser, para não ter de a escrever à mão. */
function readDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const a = new Audio();
    const done = (v: number | null) => {
      URL.revokeObjectURL(url);
      resolve(v);
    };
    a.preload = "metadata";
    a.onloadedmetadata = () => done(Number.isFinite(a.duration) && a.duration > 0 ? Math.round(a.duration) : null);
    a.onerror = () => done(null);
    a.src = url;
  });
}

/** Envia vários MP3/M4A de uma vez: cada ficheiro passa a ser um conteúdo só com áudio próprio. */
export function BulkAudioUpload({ categories }: { categories: { id: string; name: string }[] }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [publish, setPublish] = useState(true);
  const [premium, setPremium] = useState(true);
  const [categoryId, setCategoryId] = useState("");

  const update = (i: number, patch: Partial<Row>) => setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  function pick(files: FileList | null) {
    if (!files) return;
    setRows(Array.from(files).map((file) => ({ file, title: titleFromFileName(file.name), state: "waiting" as const })));
  }

  async function sendAll() {
    setBusy(true);
    const supabase = createClient();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row.state === "done") continue;
      const type = audioType(row.file);
      if (!type) {
        update(i, { state: "error", message: "Use MP3 ou M4A." });
        continue;
      }
      if (row.file.size > CONTENT_AUDIO_MAX_BYTES) {
        update(i, { state: "error", message: "Mais de 50 MB. Exporte a 96–128 kbps." });
        continue;
      }
      update(i, { state: "sending", message: undefined });
      const name = `${row.title} ${row.file.name}`;
      const binaural = /binaural/i.test(name);
      const hz = !binaural ? /(\d{2,5}(?:[.,]\d+)?)\s?hz/i.exec(name) : null;
      const prep = await createAudioContentAction({
        fileName: row.file.name,
        type,
        size: row.file.size,
        title: row.title.trim() || titleFromFileName(row.file.name),
        durationSeconds: await readDuration(row.file),
        isPremium: premium,
        isBinaural: binaural,
        declaredFrequencyHz: hz ? Number(hz[1].replace(",", ".")) : null,
        categoryId: categoryId || null,
      }).catch(() => null);
      if (!prep?.ok || !prep.data) {
        update(i, { state: "error", message: prep && !prep.ok ? prep.error : "Falha de ligação." });
        continue;
      }
      const { contentId, path, token } = prep.data;
      const { error } = await supabase.storage.from(CONTENT_AUDIO_BUCKET).uploadToSignedUrl(path, token, row.file, { contentType: type });
      if (error) {
        await discardAudioContentAction(contentId).catch(() => undefined);
        update(i, { state: "error", message: "O envio falhou. Tente de novo." });
        continue;
      }
      const fin = await finishAudioContentAction({ contentId, path, publish }).catch(() => null);
      if (!fin?.ok) {
        await discardAudioContentAction(contentId).catch(() => undefined);
        update(i, { state: "error", message: fin && !fin.ok ? fin.error : "Falha de ligação." });
        continue;
      }
      update(i, { state: "done", contentId });
    }
    setBusy(false);
  }

  const done = rows.filter((r) => r.state === "done").length;

  return (
    <div className="space-y-5">
      <div className="glass space-y-4 p-6">
        <p className="text-sm text-mute">
          Cada ficheiro passa a ser um conteúdo só com áudio próprio, que toca com o ecrã bloqueado e pode ser descarregado (só nos planos com áudio AUREA, em Admin → Planos). O título vem do nome do ficheiro (pode alterá-lo abaixo ou depois). Use apenas
          áudio que criou ou que tem licença para usar. Máximo 50 MB por ficheiro.
        </p>
        <div className="flex flex-wrap items-end gap-4">
          <label className={buttonClass("gold", "md", busy ? "pointer-events-none opacity-60" : "cursor-pointer")}>
            Escolher ficheiros
            <input type="file" multiple accept=".mp3,.m4a,.aac,audio/mpeg,audio/mp4,audio/x-m4a,audio/aac" className="sr-only" disabled={busy} onChange={(e) => pick(e.target.files)} />
          </label>
          <label className="text-xs text-mute">
            Categoria
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={`${inputClass} mt-1 h-11 w-48`} disabled={busy}>
              <option value="">Sem categoria</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex h-11 items-center gap-2 text-sm text-paper/80">
            <input type="checkbox" checked={premium} onChange={(e) => setPremium(e.target.checked)} disabled={busy} className="accent-[#D6B46A]" /> Premium
          </label>
          <label className="flex h-11 items-center gap-2 text-sm text-paper/80">
            <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} disabled={busy} className="accent-[#D6B46A]" /> Publicar logo
          </label>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="glass divide-y divide-white/5">
          {rows.map((r, i) => (
            <div key={`${r.file.name}-${i}`} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <span className="w-5 shrink-0">
                {r.state === "sending" && <Loader2 className="h-4 w-4 animate-spin text-gold-light" />}
                {r.state === "done" && <CheckCircle2 className="h-4 w-4 text-ok" />}
                {r.state === "error" && <AlertCircle className="h-4 w-4 text-danger" />}
              </span>
              <input
                value={r.title}
                onChange={(e) => update(i, { title: e.target.value })}
                disabled={busy || r.state === "done"}
                maxLength={140}
                aria-label={`Título de ${r.file.name}`}
                className={`${inputClass} h-10 min-w-0 flex-1`}
              />
              <span className="text-xs text-mute">{(r.file.size / 1024 / 1024).toFixed(1)} MB</span>
              {r.state === "done" && r.contentId && (
                <Link href={`/admin/conteudos/${r.contentId}`} className="text-xs text-gold-light hover:underline">
                  Editar
                </Link>
              )}
              {r.message && <span className="w-full pl-8 text-xs text-danger">{r.message}</span>}
            </div>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-4">
          <button type="button" onClick={sendAll} disabled={busy || done === rows.length} className={buttonClass("gold", "md")}>
            {busy ? "A enviar… não feche esta página" : done ? "Enviar os que faltam" : `Enviar ${rows.length} ${rows.length === 1 ? "áudio" : "áudios"}`}
          </button>
          {done > 0 && <span className="text-sm text-mute">{done} de {rows.length} enviados.</span>}
        </div>
      )}
    </div>
  );
}
