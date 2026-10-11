/**
 * Origem da visita (UTMs dos anúncios). Guardada num cookie ao chegar ao site e
 * reenviada no link de checkout da Kursinha, para ferramentas de rastreio (ex.: UTMify)
 * atribuírem a venda à campanha certa, mesmo depois do registo e da confirmação do e-mail.
 */
export const UTM_COOKIE = "aurea_utm";
export const UTM_MAX_AGE = 60 * 60 * 24 * 30;
export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_id", "src", "sck", "fbclid"] as const;

/** Parâmetros de origem presentes num URL (ou null se não houver nenhum). */
export function utmFromSearch(search: URLSearchParams): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const k of UTM_KEYS) {
    const v = search.get(k)?.trim();
    if (v) out[k] = v.slice(0, 200);
  }
  return Object.keys(out).length ? out : null;
}

export function parseUtmCookie(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const k of UTM_KEYS) if (typeof obj[k] === "string" && obj[k]) out[k] = String(obj[k]).slice(0, 200);
    return out;
  } catch {
    return {};
  }
}

/** Junta as UTMs guardadas ao link de checkout, sem substituir parâmetros que o link já tenha. */
export function withUtm(checkoutUrl: string, utm: Record<string, string>): string {
  try {
    const u = new URL(checkoutUrl);
    for (const [k, v] of Object.entries(utm)) if (!u.searchParams.has(k)) u.searchParams.set(k, v);
    return u.toString();
  } catch {
    return checkoutUrl;
  }
}
