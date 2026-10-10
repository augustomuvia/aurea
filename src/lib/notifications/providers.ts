import { base64url, buildMime, type MimeMessage } from "./mime";

/**
 * Camada de envio, independente dos fluxos comerciais. Trocar de fornecedor é
 * implementar esta interface e escolher EMAIL_PROVIDER.
 */
export type SendResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string; permanent: boolean; config?: boolean };

export interface EmailProvider {
  id: string;
  label: string;
  /** Lista das variáveis de ambiente em falta (vazia = configurado). Nunca devolve valores. */
  missing(): string[];
  send(msg: MimeMessage): Promise<SendResult>;
}

type Env = Record<string, string | undefined>;
type Fetch = typeof fetch;

const TIMEOUT = 15_000;

/**
 * Gmail API (Google Workspace) com OAuth 2.0: um refresh token da conta
 * remetente, com o âmbito gmail.send. A palavra-passe da conta nunca é usada.
 */
export function gmailProvider(env: Env = process.env, fetchImpl: Fetch = fetch): EmailProvider {
  let cached: { token: string; exp: number } | null = null;

  async function accessToken(): Promise<{ ok: true; token: string } | { ok: false; error: string; config: boolean }> {
    if (cached && cached.exp > Date.now() + 60_000) return { ok: true, token: cached.token };
    let res: Response;
    try {
      res = await fetchImpl("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: env.GOOGLE_CLIENT_ID ?? "",
          client_secret: env.GOOGLE_CLIENT_SECRET ?? "",
          refresh_token: env.GOOGLE_REFRESH_TOKEN ?? "",
          grant_type: "refresh_token",
        }),
        signal: AbortSignal.timeout(TIMEOUT),
      });
    } catch (e) {
      return { ok: false, error: `Google OAuth indisponível: ${e instanceof Error ? e.message : "erro de rede"}`, config: false };
    }
    const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
    if (!res.ok || !body.access_token) {
      const code = body.error ?? `HTTP ${res.status}`;
      // invalid_grant / invalid_client: credenciais revogadas, expiradas ou erradas.
      const config = res.status === 400 || res.status === 401;
      return { ok: false, error: `Autenticação Google recusada (${code}${body.error_description ? `: ${body.error_description}` : ""})`, config };
    }
    cached = { token: body.access_token, exp: Date.now() + (body.expires_in ?? 3600) * 1000 };
    return { ok: true, token: body.access_token };
  }

  return {
    id: "gmail",
    label: "Google Workspace (Gmail API)",
    missing() {
      return ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"].filter((k) => !env[k]);
    },
    async send(msg) {
      let raw: string;
      try {
        raw = base64url(buildMime(msg));
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Mensagem inválida", permanent: true };
      }
      const tok = await accessToken();
      if (!tok.ok) return { ok: false, error: tok.error, permanent: false, config: tok.config };
      let res: Response;
      try {
        res = await fetchImpl("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
          method: "POST",
          headers: { Authorization: `Bearer ${tok.token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ raw }),
          signal: AbortSignal.timeout(TIMEOUT),
        });
      } catch (e) {
        return { ok: false, error: `Gmail API indisponível: ${e instanceof Error ? e.message : "erro de rede"}`, permanent: false };
      }
      const body = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string; status?: string } };
      if (res.ok && body.id) return { ok: true, messageId: body.id };
      const detail = `Gmail API ${res.status}${body.error?.status ? ` ${body.error.status}` : ""}: ${body.error?.message ?? "sem detalhe"}`;
      if (res.status === 401) cached = null;
      // 401/403: credenciais ou autorização (âmbito, remetente não autorizado). 400: mensagem inválida.
      if (res.status === 401 || res.status === 403) return { ok: false, error: detail, permanent: false, config: true };
      if (res.status === 400) return { ok: false, error: detail, permanent: true };
      return { ok: false, error: detail, permanent: false };
    },
  };
}

/** Fornecedor ainda por escolher: nada é enviado nem simulado. */
export const unconfiguredProvider: EmailProvider = {
  id: "none",
  label: "Nenhum",
  missing: () => ["EMAIL_PROVIDER"],
  async send() {
    return { ok: false, error: "Integração por configurar", permanent: false, config: true };
  },
};

const GOOGLE_KEYS = ["EMAIL_PROVIDER", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"] as const;

/** Remove espaços, quebras de linha e aspas que ficam ao colar valores na Vercel. */
export function cleanEnvValue(v: string | undefined): string | undefined {
  if (v === undefined) return undefined;
  const t = v.trim().replace(/^(["'])(.*)\1$/s, "$2").trim();
  return t || undefined;
}

export function cleanGoogleEnv(env: Env = process.env): Env {
  const out: Env = {};
  for (const k of GOOGLE_KEYS) out[k] = cleanEnvValue(env[k]);
  return out;
}

export interface GoogleEnvCheck {
  key: string;
  ok: boolean;
  detail: string;
}

/**
 * Diagnóstico para o painel de administração. Nunca devolve a chave secreta nem o
 * token: só o comprimento, o formato esperado e se havia espaços a mais. O ID do
 * cliente OAuth não é secreto (aparece nos URLs de autorização) e é mostrado
 * por inteiro para poder ser comparado com o Google Cloud.
 */
export function diagnoseGoogleEnv(env: Env = process.env): GoogleEnvCheck[] {
  const clean = cleanGoogleEnv(env);
  const padded = (k: string) => env[k] !== undefined && env[k] !== clean[k] && clean[k] !== undefined;
  const note = (k: string) => (padded(k) ? " (tinha espaços ou aspas a mais, já são ignorados)" : "");
  const id = clean.GOOGLE_CLIENT_ID;
  const secret = clean.GOOGLE_CLIENT_SECRET;
  const token = clean.GOOGLE_REFRESH_TOKEN;
  const idOk = !!id && /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(id);
  return [
    { key: "EMAIL_PROVIDER", ok: clean.EMAIL_PROVIDER === "gmail", detail: clean.EMAIL_PROVIDER ? `"${clean.EMAIL_PROVIDER}"${note("EMAIL_PROVIDER")}` : "em falta" },
    {
      key: "GOOGLE_CLIENT_ID",
      ok: idOk,
      detail: id
        ? idOk
          ? `${id}${note("GOOGLE_CLIENT_ID")}`
          : `formato inesperado (${id.length} caracteres${id.startsWith("GOCSPX-") ? ", parece a chave secreta" : id.startsWith("1//") ? ", parece o refresh token" : ""}); deve terminar em .apps.googleusercontent.com`
        : "em falta",
    },
    {
      key: "GOOGLE_CLIENT_SECRET",
      ok: !!secret && secret.startsWith("GOCSPX-"),
      detail: secret ? `${secret.length} caracteres, ${secret.startsWith("GOCSPX-") ? "começa por GOCSPX-" : "não começa por GOCSPX-"}, termina em …${secret.slice(-4)} (compare com a chave ativa no Google Cloud)${note("GOOGLE_CLIENT_SECRET")}` : "em falta",
    },
    {
      key: "GOOGLE_REFRESH_TOKEN",
      ok: !!token && token.startsWith("1//"),
      detail: token ? `${token.length} caracteres, ${token.startsWith("1//") ? "começa por 1//" : "não começa por 1//"}${note("GOOGLE_REFRESH_TOKEN")}` : "em falta",
    },
  ];
}

export function getEmailProvider(env: Env = process.env): EmailProvider {
  const clean = cleanGoogleEnv(env);
  return clean.EMAIL_PROVIDER === "gmail" ? gmailProvider(clean) : unconfiguredProvider;
}
