import { randomBytes } from "node:crypto";

/** Mensagem MIME (RFC 5322 / 2045 / 2047) com versão em texto e HTML, em UTF-8. */
export interface MimeMessage {
  from: { name: string; email: string };
  to: string;
  replyTo?: string | null;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
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

function b64lines(s: string) {
  return (
    Buffer.from(s, "utf8")
      .toString("base64")
      .match(/.{1,76}/g)
      ?.join("\r\n") ?? ""
  );
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
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  return [
    ...headers,
    "",
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
    "",
  ].join("\r\n");
}

export function base64url(s: string) {
  return Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
