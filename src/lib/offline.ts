/**
 * Áudios AUREA descarregados para ouvir sem rede (planos Trimestral e Anual).
 * Os ficheiros ficam no Cache Storage do navegador; a lista fica no localStorage.
 * Só funciona no browser. Cada download tem um prazo (`until`) igual ao fim da assinatura:
 * depois disso o áudio deixa de tocar e é apagado, até o utilizador renovar e abrir a app com rede.
 */

export const OFFLINE_CACHE = "aurea-offline-audio";
const LIST_KEY = "aurea.offline.v1";
export const OFFLINE_EVENT = "aurea-offline-change";

export interface OfflineTrack {
  contentId: string;
  slug: string;
  title: string;
  category: string | null;
  coverUrl: string;
  durationSeconds: number | null;
  bytes: number;
  savedAt: string;
  until: string;
}

const audioKey = (contentId: string) => `/offline-audio/${contentId}`;

export function offlineSupported() {
  return typeof window !== "undefined" && "caches" in window && typeof localStorage !== "undefined";
}

export function listOffline(): OfflineTrack[] {
  try {
    const raw = localStorage.getItem(LIST_KEY);
    const list = raw ? (JSON.parse(raw) as OfflineTrack[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveList(list: OfflineTrack[]) {
  try {
    localStorage.setItem(LIST_KEY, JSON.stringify(list));
  } catch {
    /* sem armazenamento: a lista não persiste */
  }
  window.dispatchEvent(new Event(OFFLINE_EVENT));
}

export const isExpired = (t: Pick<OfflineTrack, "until">) => !(Date.parse(t.until) > Date.now());

export function isDownloaded(contentId: string) {
  return listOffline().some((t) => t.contentId === contentId && !isExpired(t));
}

export class OfflineError extends Error {
  constructor(public code: "plan_required" | "network" | "quota" | "unsupported") {
    super(code);
  }
}

/** Descarrega o áudio de um conteúdo. `onProgress` recebe 0..1 quando o tamanho é conhecido. */
export async function downloadForOffline(
  track: Omit<OfflineTrack, "bytes" | "savedAt" | "until">,
  onProgress?: (p: number) => void,
): Promise<OfflineTrack> {
  if (!offlineSupported()) throw new OfflineError("unsupported");
  const meta = await fetch(`/api/audio/${track.contentId}?offline=1`, { cache: "no-store" }).catch(() => null);
  if (!meta) throw new OfflineError("network");
  if (meta.status === 403) throw new OfflineError("plan_required");
  if (!meta.ok) throw new OfflineError("network");
  const { url, until } = (await meta.json()) as { url: string; until: string };

  const res = await fetch(url).catch(() => null);
  if (!res?.ok || !res.body) throw new OfflineError("network");
  const total = Number(res.headers.get("content-length")) || 0;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read().catch(() => {
      throw new OfflineError("network");
    });
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total) onProgress?.(received / total);
  }
  const blob = new Blob(chunks as BlobPart[], { type: res.headers.get("content-type") || "audio/mpeg" });

  // Persistente: pede ao navegador para não apagar os downloads quando faltar espaço.
  await navigator.storage?.persist?.().catch(() => false);
  const cache = await caches.open(OFFLINE_CACHE);
  try {
    await cache.put(audioKey(track.contentId), new Response(blob, { headers: { "Content-Type": blob.type, "Content-Length": String(blob.size) } }));
  } catch {
    throw new OfflineError("quota");
  }
  const saved: OfflineTrack = { ...track, bytes: blob.size, savedAt: new Date().toISOString(), until };
  saveList([saved, ...listOffline().filter((t) => t.contentId !== track.contentId)]);
  return saved;
}

export async function removeOffline(contentId: string) {
  if (!offlineSupported()) return;
  const cache = await caches.open(OFFLINE_CACHE);
  await cache.delete(audioKey(contentId));
  saveList(listOffline().filter((t) => t.contentId !== contentId));
}

/** Ao terminar sessão: o próximo utilizador do aparelho não fica com os downloads. */
export async function clearOffline() {
  if (!offlineSupported()) return;
  await caches.delete(OFFLINE_CACHE).catch(() => false);
  try {
    localStorage.removeItem(LIST_KEY);
  } catch {
    /* nada */
  }
  window.dispatchEvent(new Event(OFFLINE_EVENT));
}

/** Atualiza o prazo de todos os downloads (com rede). Sem plano: apaga-os. */
export async function refreshOfflineAccess(access: { allowed: boolean; until: string | null }) {
  const list = listOffline();
  if (!list.length) return;
  if (!access.allowed || !access.until) {
    await clearOffline();
    return;
  }
  saveList(list.map((t) => ({ ...t, until: access.until! })));
}

/** URL local (blob:) para tocar um download, ou null se já não existir ou tiver expirado. */
export async function offlineObjectUrl(contentId: string): Promise<string | null> {
  const t = listOffline().find((x) => x.contentId === contentId);
  if (!t || isExpired(t) || !offlineSupported()) return null;
  const res = await (await caches.open(OFFLINE_CACHE)).match(audioKey(contentId));
  return res ? URL.createObjectURL(await res.blob()) : null;
}

/** As capas em /covers ficam guardadas pelo service worker; as do YouTube precisam de rede. */
export const offlineCover = (t: Pick<OfflineTrack, "coverUrl">) => (t.coverUrl.startsWith("/covers/") ? t.coverUrl : "/covers/aurea.jpg");

/** Apaga downloads expirados (o ficheiro e a entrada). */
export async function purgeExpired() {
  for (const t of listOffline()) if (isExpired(t)) await removeOffline(t.contentId);
}

export function formatMb(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(bytes > 100 * 1024 * 1024 ? 0 : 1)} MB`;
}
