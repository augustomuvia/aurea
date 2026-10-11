/**
 * Pixel da Meta (Facebook/Instagram Ads): mede visitas, registos e idas ao checkout
 * para os anúncios otimizarem para quem compra. Pode ser trocado com NEXT_PUBLIC_META_PIXEL_ID;
 * "off" desliga-o.
 */
const DEFAULT_PIXEL_ID = "976644591233887";

export const META_PIXEL_ID = (() => {
  const v = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim();
  if (v === "off") return null;
  return v && /^\d{6,20}$/.test(v) ? v : DEFAULT_PIXEL_ID;
})();

/** Áreas onde não medimos: administração, e-book e a página sem rede. */
export const pixelSkipped = (pathname: string) => /^\/(admin|ebook|offline)(\/|$)/.test(pathname);

type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...a: unknown[]) => void; queue: unknown[][]; loaded: boolean; version: string; push: Fbq };

/** Equivalente ao código base oficial da Meta: cria a fila `fbq`, carrega fbevents.js e inicia o pixel uma vez. */
function ensurePixel(id: string): Fbq {
  const w = window as unknown as { fbq?: Fbq; _fbq?: Fbq };
  if (w.fbq) return w.fbq;
  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue.push(args);
  } as Fbq;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];
  w.fbq = fbq;
  if (!w._fbq) w._fbq = fbq;
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(s);
  fbq("init", id);
  return fbq;
}

export function trackPixel(event: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined" || !META_PIXEL_ID || pixelSkipped(window.location.pathname)) return;
  if (params) ensurePixel(META_PIXEL_ID)("track", event, params);
  else ensurePixel(META_PIXEL_ID)("track", event);
}
