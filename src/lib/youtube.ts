/**
 * Validação de URLs do YouTube e extração do identificador do vídeo.
 * Aceita apenas formatos oficiais; tudo o resto é rejeitado.
 */
const ID_RE = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtube-nocookie.com", "youtube-nocookie.com"]);

export type YouTubeParseResult = { ok: true; videoId: string; canonicalUrl: string } | { ok: false; error: string };

export function parseYouTubeUrl(input: string): YouTubeParseResult {
  const raw = (input ?? "").trim();
  if (!raw) return { ok: false, error: "Indique um URL do YouTube." };
  if (raw.length > 500) return { ok: false, error: "URL demasiado longo." };

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "URL inválido." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, error: "Apenas URLs http(s) são aceites." };
  const host = url.hostname.toLowerCase();
  if (!HOSTS.has(host)) return { ok: false, error: "O URL tem de ser do YouTube." };

  let id: string | null = null;
  const parts = url.pathname.split("/").filter(Boolean);

  if (host === "youtu.be") {
    id = parts[0] ?? null;
  } else if (parts[0] === "watch") {
    id = url.searchParams.get("v");
  } else if (["embed", "shorts", "live", "v", "e"].includes(parts[0] ?? "")) {
    id = parts[1] ?? null;
  } else if (parts.length === 0 && url.searchParams.get("v")) {
    id = url.searchParams.get("v");
  }

  if (parts[0] === "playlist" || (!id && url.searchParams.get("list"))) {
    return { ok: false, error: "Playlists não são suportadas. Use o link de um vídeo." };
  }
  if (!id || !ID_RE.test(id)) return { ok: false, error: "Não foi possível identificar um vídeo válido neste URL." };

  return { ok: true, videoId: id, canonicalUrl: `https://www.youtube.com/watch?v=${id}` };
}

export function youtubeThumbnail(videoId: string, quality: "hq" | "maxres" = "hq") {
  return `https://i.ytimg.com/vi/${videoId}/${quality === "maxres" ? "maxresdefault" : "hqdefault"}.jpg`;
}

/** Códigos de erro do YouTube IFrame Player API → mensagem compreensível. */
export function describePlayerError(code: number): string {
  switch (code) {
    case 2:
      return "O identificador deste vídeo é inválido.";
    case 5:
      return "Este conteúdo não pode ser reproduzido neste navegador.";
    case 100:
      return "Este vídeo foi removido ou é privado.";
    case 101:
    case 150:
    case 153:
      return "O proprietário deste vídeo não permite a reprodução fora do YouTube.";
    default:
      return "Não foi possível reproduzir este conteúdo neste momento.";
  }
}

export type OEmbedCheck =
  | { ok: true; title: string; authorName: string; thumbnailUrl: string }
  | { ok: false; reason: "not_found" | "not_embeddable" | "unavailable" };

/**
 * Verifica existência e permissão de incorporação via endpoint oEmbed oficial.
 * 401 → incorporação desativada; 404/400 → privado ou inexistente.
 */
export async function checkYouTubeOEmbed(videoId: string, fetchImpl: typeof fetch = fetch): Promise<OEmbedCheck> {
  const target = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`;
  try {
    const res = await fetchImpl(target, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (res.status === 401 || res.status === 403) return { ok: false, reason: "not_embeddable" };
    if (res.status === 404 || res.status === 400) return { ok: false, reason: "not_found" };
    if (!res.ok) return { ok: false, reason: "unavailable" };
    const j = (await res.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
    return { ok: true, title: j.title ?? "", authorName: j.author_name ?? "", thumbnailUrl: j.thumbnail_url ?? youtubeThumbnail(videoId) };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
