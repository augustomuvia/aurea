import { allowedVars, TEMPLATES, VARIABLES, type DesignButton, type TemplateContent, type TemplateKey, type VarName, type Vars } from "./templates";

/**
 * Renderização dos e-mails: HTML compatível com clientes de e-mail (tabelas,
 * CSS inline, sem JavaScript nem imagens obrigatórias) e versão em texto simples.
 * Todo o conteúdo dinâmico é escapado.
 */

export interface RenderOptions {
  siteUrl: string;
  supportEmail: string;
  button?: DesignButton;
  footerNote?: string;
  /** Marca o e-mail como teste (assunto e faixa no topo). */
  test?: boolean;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const VAR_RE = /\{\{\s*([a-z_]+)\s*\}\}/g;

export function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function interpolate(tpl: string, vars: Vars) {
  return tpl.replace(VAR_RE, (_, name: string) => vars[name as VarName] ?? "");
}

/** Variáveis usadas num texto. */
export function usedVars(tpl: string): string[] {
  return [...tpl.matchAll(VAR_RE)].map((m) => m[1]);
}

export interface TemplateIssue {
  field: keyof TemplateContent;
  message: string;
}

/** Recusa variáveis desconhecidas, chaves mal fechadas e variáveis obrigatórias em falta. */
export function validateTemplate(key: TemplateKey, c: TemplateContent): TemplateIssue[] {
  const issues: TemplateIssue[] = [];
  const allowed = new Set<string>(allowedVars(key));
  const def = TEMPLATES[key];
  for (const field of ["subject", "heading", "body", "cta_label"] as const) {
    const v = c[field] ?? "";
    const stripped = v.replace(VAR_RE, "");
    if (/\{\{|\}\}/.test(stripped)) issues.push({ field, message: "Há chavetas {{ }} mal fechadas ou com nomes inválidos." });
    for (const name of usedVars(v)) {
      if (!(name in VARIABLES)) issues.push({ field, message: `A variável {{${name}}} não existe.` });
      else if (!allowed.has(name)) issues.push({ field, message: `A variável {{${name}}} não está disponível neste modelo.` });
    }
  }
  if (/[\r\n]/.test(c.subject)) issues.push({ field: "subject", message: "O assunto tem de ficar numa só linha." });
  if (c.subject.trim().length < 3) issues.push({ field: "subject", message: "Indique um assunto." });
  if (c.heading.trim().length < 2) issues.push({ field: "heading", message: "Indique um título." });
  if (c.body.trim().length < 10) issues.push({ field: "body", message: "O corpo é demasiado curto." });
  if (c.cta_label.trim().length < 2) issues.push({ field: "cta_label", message: "Indique o texto do botão." });
  const all = `${c.subject}\n${c.body}`;
  for (const req of def.required) {
    if (!usedVars(all).includes(req)) issues.push({ field: "body", message: `Este modelo tem de incluir {{${req}}} no assunto ou no corpo.` });
  }
  return issues;
}

const C = {
  ink: "#0B0B0F",
  text: "#2A2A33",
  mute: "#6B6B76",
  line: "#ECE6D8",
  gold: "#B8913F",
  goldSoft: "#F7F1E3",
  bg: "#F6F4EF",
};
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

/** Escapa e transforma URLs absolutas em ligações descritivas. */
function richText(s: string) {
  return escapeHtml(s)
    .replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)]/g, (url) => `<a href="${url}" style="color:${C.gold};text-decoration:underline">${url.replace(/^https?:\/\//, "")}</a>`)
    .replace(/\n/g, "<br>");
}

function paragraphs(body: string) {
  return body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function renderEmail(key: TemplateKey, content: TemplateContent, vars: Vars, opts: RenderOptions): RenderedEmail {
  const def = TEMPLATES[key];
  const v = vars;
  const subject = (opts.test ? "[TESTE] " : "") + interpolate(content.subject, v).replace(/\s+/g, " ").trim();
  const heading = interpolate(content.heading, v);
  const paras = paragraphs(interpolate(content.body, v));
  const details = def.details.map(([label, name]) => [label, v[name] ?? ""] as const).filter(([, val]) => val.trim() !== "");
  const ctaUrl = v[def.ctaLink] || opts.siteUrl;
  const ctaLabel = interpolate(content.cta_label, v);
  const footnote = def.footnote ? interpolate(def.footnote, { ...v, email_suporte: opts.supportEmail }) : "";
  const preheader = paras[1] ?? paras[0] ?? heading;
  const button = opts.button === "gold" ? { bg: "#D6B46A", fg: C.ink, border: "#C9A55A" } : { bg: C.ink, fg: "#FFFFFF", border: C.ink };
  const site = opts.siteUrl.replace(/^https?:\/\//, "");

  const html = `<!doctype html>
<html lang="pt" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(subject)}</title>
<style>
  @media only screen and (max-width:620px){ .wrap{width:100%!important} .pad{padding-left:24px!important;padding-right:24px!important} .h1{font-size:26px!important;line-height:32px!important} }
  a{color:${C.gold}}
</style>
</head>
<body style="margin:0;padding:0;background:${C.bg};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.bg};font-size:1px;line-height:1px">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg}">
<tr><td align="center" style="padding:32px 12px">
  <table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#FFFFFF;border:1px solid ${C.line};border-radius:14px">
    ${opts.test ? `<tr><td style="background:${C.goldSoft};color:${C.ink};font:600 12px/18px ${FONT};padding:10px 40px;border-radius:14px 14px 0 0;text-align:center">E-mail de teste com dados de demonstração. Não é uma mensagem real.</td></tr>` : ""}
    <tr><td class="pad" style="padding:36px 48px 8px 48px">
      <p style="margin:0;font:600 13px/16px ${FONT};letter-spacing:6px;color:${C.ink}">AUREA</p>
      <div style="width:40px;height:2px;background:${C.gold};margin:14px 0 0 0;line-height:2px;font-size:2px">&nbsp;</div>
    </td></tr>
    <tr><td class="pad" style="padding:24px 48px 0 48px">
      <h1 class="h1" style="margin:0;font:400 30px/36px ${SERIF};color:${C.ink}">${escapeHtml(heading)}</h1>
    </td></tr>
    <tr><td class="pad" style="padding:16px 48px 0 48px;font:400 16px/26px ${FONT};color:${C.text}">
      ${paras.map((p) => `<p style="margin:0 0 16px 0">${richText(p)}</p>`).join("\n      ")}
    </td></tr>
    ${
      details.length
        ? `<tr><td class="pad" style="padding:8px 48px 8px 48px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${C.line};border-radius:10px;background:#FCFBF8">
        ${details
          .map(
            ([label, val], i) =>
              `<tr><td style="padding:10px 16px;font:400 13px/20px ${FONT};color:${C.mute};width:42%;vertical-align:top;${i ? `border-top:1px solid ${C.line};` : ""}">${escapeHtml(label)}</td><td style="padding:10px 16px;font:600 14px/20px ${FONT};color:${C.ink};vertical-align:top;word-break:break-word;${i ? `border-top:1px solid ${C.line};` : ""}">${richText(val)}</td></tr>`,
          )
          .join("\n        ")}
      </table>
    </td></tr>`
        : ""
    }
    <tr><td class="pad" style="padding:24px 48px 8px 48px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="border-radius:999px;background:${button.bg};border:1px solid ${button.border}">
          <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:14px 28px;font:600 15px/18px ${FONT};color:${button.fg};text-decoration:none;border-radius:999px">${escapeHtml(ctaLabel)}</a>
        </td>
      </tr></table>
    </td></tr>
    ${footnote ? `<tr><td class="pad" style="padding:16px 48px 0 48px;font:400 13px/20px ${FONT};color:${C.mute}">${richText(footnote)}</td></tr>` : ""}
    <tr><td class="pad" style="padding:32px 48px 36px 48px">
      <div style="border-top:1px solid ${C.line};padding-top:20px;font:400 12px/19px ${FONT};color:${C.mute}">
        <strong style="color:${C.ink};letter-spacing:3px">AUREA</strong><br>
        Suporte: <a href="mailto:${escapeHtml(opts.supportEmail)}" style="color:${C.gold}">${escapeHtml(opts.supportEmail)}</a> · <a href="${escapeHtml(opts.siteUrl)}" style="color:${C.gold}">${escapeHtml(site)}</a>
        ${opts.footerNote ? `<br>${richText(opts.footerNote)}` : ""}
        <br>Recebe este e-mail porque tem uma conta AUREA ou é administrador da plataforma.
      </div>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    opts.test ? "[E-MAIL DE TESTE COM DADOS DE DEMONSTRAÇÃO]\n" : "",
    "AUREA",
    "",
    heading,
    "",
    ...paras.flatMap((p) => [p, ""]),
    ...(details.length ? [...details.map(([l, val]) => `${l}: ${val}`), ""] : []),
    `${ctaLabel}: ${ctaUrl}`,
    "",
    ...(footnote ? [footnote, ""] : []),
    "—",
    `AUREA · ${opts.supportEmail} · ${opts.siteUrl}`,
    ...(opts.footerNote ? [opts.footerNote] : []),
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { subject, html, text };
}

/** E-mail de verificação da integração (não editável). */
export function renderVerificationEmail(code: string, fromAddress: string, opts: RenderOptions): RenderedEmail {
  const content: TemplateContent = {
    subject: "AUREA · código de verificação do envio de e-mails",
    heading: "Verificação do envio",
    body: `Este e-mail confirma que a AUREA consegue enviar mensagens a partir de ${fromAddress}.\n\nIntroduza este código no painel, em Notificações, para ativar a integração:\n\n${code}`,
    cta_label: "Abrir o painel",
  };
  const r = renderEmail("admin_payment_confirmed", content, { link_admin: `${opts.siteUrl}/admin/notificacoes` }, { ...opts, test: false });
  return r;
}
