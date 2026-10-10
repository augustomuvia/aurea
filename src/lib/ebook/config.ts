import { z } from "zod";

/**
 * Configuração da página de venda do AUREA Guide (/ebook).
 * Módulo puro (sem acesso à BD) para ser usado no servidor, no admin e nos testes.
 */

export const EBOOK_SECTIONS = ["orientacao", "conteudo", "experiencia", "faq"] as const;
export type EbookSection = (typeof EBOOK_SECTIONS)[number];
export const SECTION_LABEL: Record<EbookSection, string> = {
  orientacao: "Saber onde começar",
  conteudo: "O que recebes",
  experiencia: "A experiência de descoberta",
  faq: "Perguntas frequentes",
};

const text = (max: number) => z.string().trim().max(max);
const required = (max: number) => z.string().trim().min(1, "Campo obrigatório.").max(max);

export const ebookConfigSchema = z.object({
  priceMinor: z.number().int().min(100).max(100_000_000),
  checkoutUrl: z.string().trim().max(2000).default(""),
  hero: z.object({
    eyebrow: required(80),
    title: required(160),
    subtitle: required(400),
    cta: required(40),
  }),
  orientacao: z.object({
    title: required(120),
    body: required(1200),
    benefits: z.array(z.object({ title: required(40), text: required(240) })).min(1).max(4),
  }),
  conteudo: z.object({
    title: required(120),
    items: z.array(required(160)).min(1).max(12),
    note: text(300),
  }),
  experiencia: z.object({
    title: required(120),
    body: required(1200),
  }),
  oferta: z.object({
    title: required(120),
    productName: required(60),
    description: required(400),
    label: required(40),
    cta: required(40),
    microtext: required(400),
    checkoutNotice: required(300),
  }),
  faq: z.array(z.object({ q: required(160), a: required(800) })).max(12),
  sections: z.object({
    orientacao: z.boolean(),
    conteudo: z.boolean(),
    experiencia: z.boolean(),
    faq: z.boolean(),
  }),
  media: z.object({
    cover: z.string().max(300).nullable(),
    previews: z.array(z.string().max(300)).max(6),
  }),
});

export type EbookConfig = z.infer<typeof ebookConfigSchema>;

export const DEFAULT_EBOOK: EbookConfig = {
  priceMinor: 250_000,
  checkoutUrl: "",
  hero: {
    eyebrow: "AUREA GUIDE · GUIA DIGITAL",
    title: "Pequenos detalhes podem mudar a forma como descobres um novo universo.",
    subtitle:
      "Viste as experiências sonoras. Agora tens um guia para descobrir como explorar a plataforma por trás delas, encontrar os conteúdos e começar com mais clareza.",
    cta: "DESCOBRIR O GUIA",
  },
  orientacao: {
    title: "Saber onde começar faz toda a diferença.",
    body:
      "Quando descobres uma nova plataforma, nem sempre é evidente onde procurar, quais os conteúdos que te interessam ou como tirar melhor partido da experiência.\n\nO AUREA Guide foi criado para te orientar nesse primeiro contacto, reunindo a descoberta do site e as principais instruções num documento simples de consultar.",
    benefits: [
      { title: "Descobre", text: "O guia revela o nome e o endereço da plataforma apresentada no anúncio." },
      { title: "Compreende", text: "Aprende a aceder ao site, identificar as suas principais áreas e encontrar os conteúdos que procuras." },
      { title: "Explora", text: "Segue uma orientação organizada para começares a utilizar a plataforma e conheceres as suas possibilidades." },
    ],
  },
  conteudo: {
    title: "O teu ponto de partida, reunido num só lugar.",
    items: [
      "Identificação do site oficial, apresentada logo na primeira página.",
      "Endereço direto para aceder à plataforma.",
      "Instruções de acesso e navegação.",
      "Orientação para encontrar as categorias e os conteúdos disponíveis.",
      "Explicação dos principais recursos relevantes.",
      "Plano introdutório de sete dias para explorar os conteúdos.",
      "Recomendações de utilização responsável.",
    ],
    note: "Imagens ilustrativas. O conteúdo completo é disponibilizado após a compra.",
  },
  experiencia: {
    title: "Uma descoberta. Um guia. Um novo ponto de partida.",
    body:
      "Em vez de depender de informações dispersas, tens um documento preparado para te orientar desde a identificação da plataforma até aos primeiros passos de utilização.\n\nConsulta o guia ao teu ritmo, volta às instruções sempre que precisares e utiliza-o como referência durante a exploração do site.",
  },
  oferta: {
    title: "Começa a tua descoberta.",
    productName: "AUREA GUIDE",
    description:
      "Um guia digital para conheceres a plataforma apresentada no anúncio, encontrares o seu endereço oficial e aprenderes a explorar os seus conteúdos.",
    label: "PAGAMENTO ÚNICO",
    cta: "QUERO O MEU GUIA",
    microtext:
      "Produto digital em PDF. O conteúdo do guia é disponibilizado após a conclusão da compra, de acordo com as condições de entrega apresentadas no checkout.",
    checkoutNotice: "O pagamento é feito no checkout externo da Kursinha. A AUREA não processa nem guarda os dados do teu pagamento.",
  },
  faq: [
    {
      q: "O que é o AUREA Guide?",
      a: "É um guia digital em PDF que revela a plataforma apresentada no anúncio, o seu endereço oficial e instruções para começar a explorá-la.",
    },
    { q: "O nome do site está incluído?", a: "Sim. O nome e o endereço da plataforma são revelados no interior do guia." },
    {
      q: "Estou a comprar acesso exclusivo à plataforma?",
      a: "Não. Estás a comprar o guia digital. O acesso ao site externo depende das condições estabelecidas pelo respetivo operador.",
    },
    {
      q: "O que recebo após o pagamento?",
      a: "Recebes o acesso ao produto digital conforme o método de entrega disponibilizado no checkout e indicado nas condições de compra.",
    },
    { q: "Posso ler o guia no telemóvel?", a: "Sim, desde que o dispositivo permita abrir ficheiros PDF." },
    {
      q: "As frequências descritas no guia são tratamentos médicos?",
      a: "Não. O material é educativo e informativo. Não substitui diagnóstico, aconselhamento ou tratamento médico.",
    },
  ],
  sections: { orientacao: true, conteudo: true, experiencia: true, faq: true },
  media: { cover: null, previews: [] },
};

/** Junta o que está guardado com os valores por omissão (campos em falta ou inválidos não partem a página). */
export function resolveEbookConfig(raw: unknown): EbookConfig {
  const merged = deepMerge(structuredClone(DEFAULT_EBOOK), raw);
  const parsed = ebookConfigSchema.safeParse(merged);
  return parsed.success ? parsed.data : structuredClone(DEFAULT_EBOOK);
}

function deepMerge<T>(base: T, over: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(over)) return (over === undefined ? base : (over as T));
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over)) {
    if (!(k in out)) continue;
    out[k] = isPlainObject(out[k]) && isPlainObject(v) ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// ------------------------------------------------------------------ Checkout

export type CheckoutCheck = { ok: true; url: string; host: string } | { ok: false; error: string };

/**
 * Valida o URL do checkout da Kursinha: só HTTPS, sem credenciais, sem portas
 * especiais, sem IPs/localhost e — quando `allowedHosts` está definido — apenas
 * nesses domínios (ou subdomínios deles).
 */
export function checkCheckoutUrl(input: string, allowedHosts: string[] = []): CheckoutCheck {
  const value = input.trim();
  if (!value) return { ok: false, error: "Indique o URL de checkout da Kursinha." };
  if (value.length > 2000) return { ok: false, error: "O URL é demasiado longo." };
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return { ok: false, error: "URL inválido." };
  }
  if (u.protocol !== "https:") return { ok: false, error: "O checkout tem de usar https://." };
  if (u.username || u.password) return { ok: false, error: "O URL não pode conter credenciais." };
  if (u.port && u.port !== "443") return { ok: false, error: "O URL não pode usar uma porta especial." };
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!host.includes(".") || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return { ok: false, error: "Domínio inválido para checkout." };
  }
  if (/^[\d.]+$/.test(host) || host.includes(":") || host.startsWith("[")) return { ok: false, error: "Use um domínio, não um endereço IP." };
  if (/(^|\.)(example\.(com|org|net)|exemplo\.(com|ao))$/.test(host)) return { ok: false, error: "Use o link real do checkout, não um link de exemplo." };
  const allowed = allowedHosts.map((h) => h.trim().toLowerCase().replace(/^\*\./, "")).filter(Boolean);
  if (allowed.length && !allowed.some((a) => host === a || host.endsWith(`.${a}`))) {
    return { ok: false, error: `Domínio não autorizado (${host}). Autorizados: ${allowed.join(", ")}.` };
  }
  u.hash = "";
  return { ok: true, url: u.toString(), host };
}

export function parseAllowedHosts(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
}

/** Converte "2.500", "2 500" ou "2500" (Kz, sem casas decimais) em cêntimos. */
export function parseKzToMinor(value: string): number | null {
  const digits = value.replace(/kz/i, "").replace(/[\s.]/g, "").trim();
  if (!/^\d{1,9}$/.test(digits)) return null;
  return Number(digits) * 100;
}

/** A página só pode ser publicada/ativada se estiver vendável. */
export function sellableProblems(cfg: EbookConfig, allowedHosts: string[]): string[] {
  const problems: string[] = [];
  const c = checkCheckoutUrl(cfg.checkoutUrl, allowedHosts);
  if (!c.ok) problems.push(c.error);
  if (cfg.priceMinor < 100) problems.push("Defina um preço válido.");
  return problems;
}
