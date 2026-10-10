const dateFmt = new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "short", year: "numeric", timeZone: "Africa/Luanda" });
const dateTimeFmt = new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Luanda" });

export const formatDate = (d: string | Date | null | undefined) => (d ? dateFmt.format(new Date(d)) : "—");
export const formatDateTime = (d: string | Date | null | undefined) => (d ? dateTimeFmt.format(new Date(d)) : "—");

export function formatDuration(totalSeconds: number | null | undefined) {
  if (!totalSeconds || totalSeconds < 0) return "";
  const s = Math.floor(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function formatDurationLong(totalSeconds: number | null | undefined) {
  if (!totalSeconds) return "";
  const m = Math.round(totalSeconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

export function slugify(input: string) {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export const SUBSCRIPTION_STATUS_LABEL: Record<string, string> = {
  none: "Sem assinatura",
  pending_payment: "Pagamento pendente",
  active: "Ativa",
  expired: "Expirada",
  suspended: "Suspensa",
  cancelled: "Cancelada",
};

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  confirmed: "Confirmado",
  rejected: "Rejeitado",
  cancelled: "Cancelado",
  expired: "Expirado",
  reversed: "Revertido",
};

export const CONTENT_STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  published: "Publicado",
  unpublished: "Despublicado",
  removed: "Removido",
};

export const USE_LABEL: Record<string, string> = {
  relaxamento: "Relaxamento",
  meditacao: "Meditação",
  concentracao: "Concentração",
  sono: "Sono",
};

/** Escapa um valor para CSV (inclui proteção contra injeção de fórmulas). */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
