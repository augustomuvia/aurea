import { randomBytes } from "node:crypto";

/** Ficheiro anexo (ex.: recibo em PDF). */
export interface MimeAttachment {
  filename: string;
  contentType: string;
  content: Uint8Array;
}

/** Limite de segurança para os anexos de uma mensagem (o Gmail API aceita mensagens até ~5 MB em "raw"). */
export const MAX_ATTACHMENTS_BYTES = 3 * 1024 * 1024;

/** Mensagem MIME (RFC 5322 / 2045 / 2047) com versão em texto e HTML, em UTF-8. */
export interface MimeMessage {
  from: { name: string; email: string };
  to: string;
  replyTo?: string | null;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
  /** Sem anexos, a mensagem é multipart/alternative; com anexos, multipart/mixed. */
  attachments?: MimeAttachment[];
}

const EMAIL_RE = /^[^\s@<>()",;:\\[\]]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export function isValidEmail(v: string) {
  return v.length <= 320 && EMAIL_RE.test(v);
}

/** Codifica um cabeçalho com caracteres não ASCII (RFC 2047, base64, em blocos). */
export function encodeHeader(v: string) {
  if (/^[\x20-\x7e]*$/.test(v)) return v;
  const chunks: string[] = [];
  let cur = "";
  for (const ch of v) {
    if (Buffer.byteLength(cur + ch, "utf8") > 45) {
      chunks.push(cur);
      cur = "";
    }
    cur += ch;
  }
  if (cur) chunks.push(cur);
  return chunks.map((c) => `=?UTF-8?B?${Buffer.from(c, "utf8").toString("base64")}?=`).join("\r\n ");
}

function address(name: string, email: string) {
  // "AUREA | Suporte" tem caracteres especiais: o nome vai entre aspas ou codificado.
  const n = /^[\x20-\x7e]*$/.test(name) ? `"${name.replace(/["\\]/g, "")}"` : encodeHeader(name);
  return `${n} <${email}>`;
}

function b64lines(s: string | Uint8Array) {
  return (
    (typeof s === "string" ? Buffer.from(s, "utf8") : Buffer.from(s))
      .toString("base64")
      .match(/.{1,76}/g)
      ?.join("\r\n") ?? ""
  );
}

/**
 * Parâmetro filename seguro: versão ASCII entre aspas (sem caracteres que partam
 * o cabeçalho) e, se o nome tiver outros caracteres, também filename* (RFC 2231).
 */
export function filenameParams(param: "filename" | "name", name: string) {
  const ascii = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 100) || "anexo";
  if (ascii === name) return `${param}="${ascii}"`;
  const encoded = Array.from(Buffer.from(name, "utf8"))
    .map((b) => (/[A-Za-z0-9._-]/.test(String.fromCharCode(b)) ? String.fromCharCode(b) : `%${b.toString(16).toUpperCase().padStart(2, "0")}`))
    .join("");
  return `${param}="${ascii}"; ${param}*=UTF-8''${encoded}`;
}

export function buildMime(m: MimeMessage): string {
  for (const e of [m.from.email, m.to, ...(m.replyTo ? [m.replyTo] : [])]) {
    if (!isValidEmail(e)) throw new Error(`Endereço inválido: ${e}`);
  }
  if (/[\r\n]/.test(m.subject)) throw new Error("Assunto inválido");
  const boundary = `aurea_${randomBytes(12).toString("hex")}`;
  const headers = [
    `From: ${address(m.from.name, m.from.email)}`,
    `To: <${m.to}>`,
    ...(m.replyTo ? [`Reply-To: <${m.replyTo}>`] : []),
    `Subject: ${encodeHeader(m.subject)}`,
    `Date: ${new Date().toUTCString().replace("GMT", "+0000")}`,
    "MIME-Version: 1.0",
    "Auto-Submitted: auto-generated",
    ...Object.entries(m.headers ?? {})
      .filter(([k, v]) => /^[A-Za-z0-9-]+$/.test(k) && !/[\r\n]/.test(v))
      .map(([k, v]) => `${k}: ${v}`),
  ];
  const attachments = m.attachments ?? [];
  const alternative = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    b64lines(m.text),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    b64lines(m.html),
    `--${boundary}--`,
  ];
  if (!attachments.length) {
    return [...headers, `Content-Type: multipart/alternative; boundary="${boundary}"`, "", ...alternative, ""].join("\r\n");
  }

  // multipart/mixed: primeiro a mensagem (texto + HTML), depois os anexos em base64.
  const total = attachments.reduce((n, a) => n + a.content.byteLength, 0);
  if (total > MAX_ATTACHMENTS_BYTES) throw new Error("Anexos demasiado grandes");
  const mixed = `aurea_mx_${randomBytes(12).toString("hex")}`;
  const parts = attachments.flatMap((a) => {
    if (!/^[a-z]+\/[a-z0-9.+-]+$/i.test(a.contentType)) throw new Error("Tipo de anexo inválido");
    return [
      `--${mixed}`,
      `Content-Type: ${a.contentType}; ${filenameParams("name", a.filename)}`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; ${filenameParams("filename", a.filename)}`,
      "",
      b64lines(a.content),
    ];
  });
  return [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
    "",
    `--${mixed}`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    ...alternative,
    ...parts,
    `--${mixed}--`,
    "",
  ].join("\r\n");
}

export function base64url(s: string) {
  return Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
