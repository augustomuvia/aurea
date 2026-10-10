import { HELVETICA_BOLD_WIDTHS, HELVETICA_WIDTHS } from "./metrics";

/**
 * Gerador de PDF 1.4 mínimo, sem dependências: uma ou mais páginas com texto
 * (Helvetica e Helvetica-Bold, fontes padrão que todos os leitores têm),
 * linhas e retângulos. O texto é codificado em WinAnsiEncoding (cp1252), o que
 * cobre o português (ç, ã, é, º, «», —, €). Caracteres fora dessa tabela são
 * substituídos por "?".
 *
 * As coordenadas usam a origem no canto superior esquerdo (y cresce para baixo),
 * em pontos (1/72 polegada). O conteúdo não é comprimido: os recibos são
 * pequenos e assim o ficheiro é fácil de inspecionar.
 */

export type PdfFont = "regular" | "bold";
export type Rgb = readonly [number, number, number];

export const A4 = { width: 595.28, height: 841.89 } as const;

const FONT_RES: Record<PdfFont, string> = { regular: "F1", bold: "F2" };

/** Caracteres de 0x80–0x9F na WinAnsiEncoding (os restantes coincidem com Latin-1). */
const CP1252_HIGH: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
  0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91,
  0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98,
  0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

/** Converte texto para bytes WinAnsi. Espaços especiais passam a espaço normal. */
export function toWinAnsi(s: string): number[] {
  const out: number[] = [];
  for (const ch of s.normalize("NFC").replace(/[   \t]/g, " ").replace(/[\r\n]+/g, " ")) {
    const c = ch.codePointAt(0)!;
    if (c >= 0x20 && c <= 0x7e) out.push(c);
    else if (c >= 0xa0 && c <= 0xff) out.push(c);
    else if (CP1252_HIGH[c] !== undefined) out.push(CP1252_HIGH[c]);
    else out.push(0x3f);
  }
  return out;
}

/** Largura do texto em pontos, com as métricas oficiais das fontes padrão. */
export function textWidth(s: string, font: PdfFont, size: number, charSpacing = 0): number {
  const table = font === "bold" ? HELVETICA_BOLD_WIDTHS : HELVETICA_WIDTHS;
  const bytes = toWinAnsi(s);
  const units = bytes.reduce((sum, b) => sum + (b >= 32 ? table[b - 32] : 0), 0);
  return (units * size) / 1000 + charSpacing * Math.max(0, bytes.length - 1);
}

/** Parte o texto em linhas que cabem na largura indicada (quebra por palavras). */
export function wrapText(s: string, font: PdfFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of s.split(/\n/)) {
    let cur = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = cur ? `${cur} ${word}` : word;
      if (cur && textWidth(next, font, size) > maxWidth) {
        lines.push(cur);
        cur = word;
      } else cur = next;
    }
    lines.push(cur);
  }
  return lines;
}

const num = (n: number) => {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? "0" : String(r);
};
const color = (c: Rgb) => c.map((v) => num(Math.min(1, Math.max(0, v)))).join(" ");
const hex = (bytes: number[]) => `<${bytes.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join("")}>`;

/** Texto para o dicionário de informação: UTF-16BE com BOM, em hexadecimal. */
function infoString(s: string) {
  const b: number[] = [0xfe, 0xff];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    b.push(c >> 8, c & 0xff);
  }
  return hex(b);
}

export interface TextOptions {
  font?: PdfFont;
  size?: number;
  color?: Rgb;
  align?: "left" | "right" | "center";
  charSpacing?: number;
}

export class PdfPage {
  readonly ops: string[] = [];
  constructor(
    readonly width: number,
    readonly height: number,
  ) {}

  private y(v: number) {
    return this.height - v;
  }

  /** Escreve uma linha de texto. `y` é a linha de base, medida a partir do topo. */
  text(s: string, x: number, y: number, o: TextOptions = {}) {
    const font = o.font ?? "regular";
    const size = o.size ?? 10;
    const cs = o.charSpacing ?? 0;
    const w = o.align && o.align !== "left" ? textWidth(s, font, size, cs) : 0;
    const left = o.align === "right" ? x - w : o.align === "center" ? x - w / 2 : x;
    this.ops.push(
      `BT /${FONT_RES[font]} ${num(size)} Tf ${color(o.color ?? [0, 0, 0])} rg ${num(cs)} Tc ${num(left)} ${num(this.y(y))} Td ${hex(toWinAnsi(s))} Tj ET`,
    );
    return this;
  }

  line(x1: number, y1: number, x2: number, y2: number, o: { width?: number; color?: Rgb } = {}) {
    this.ops.push(`${num(o.width ?? 0.75)} w ${color(o.color ?? [0, 0, 0])} RG ${num(x1)} ${num(this.y(y1))} m ${num(x2)} ${num(this.y(y2))} l S`);
    return this;
  }

  /** Retângulo com o canto superior esquerdo em (x, y). */
  rect(x: number, y: number, w: number, h: number, o: { fill?: Rgb; stroke?: Rgb; width?: number } = {}) {
    const parts = [`${num(x)} ${num(this.y(y + h))} ${num(w)} ${num(h)} re`];
    if (o.fill) parts.unshift(`${color(o.fill)} rg`);
    if (o.stroke) parts.unshift(`${num(o.width ?? 0.75)} w ${color(o.stroke)} RG`);
    parts.push(o.fill && o.stroke ? "B" : o.fill ? "f" : "S");
    this.ops.push(parts.join(" "));
    return this;
  }
}

export class PdfDocument {
  private pages: PdfPage[] = [];
  constructor(private info: { title?: string; author?: string; subject?: string; creationDate?: Date } = {}) {}

  addPage(width: number = A4.width, height: number = A4.height) {
    const p = new PdfPage(width, height);
    this.pages.push(p);
    return p;
  }

  /** Serializa o documento com a tabela xref e os deslocamentos corretos (em bytes). */
  toBytes(): Uint8Array {
    if (!this.pages.length) this.addPage();
    const objects: string[] = [];
    const add = (body: string) => objects.push(body); // devolve o número do objeto (a partir de 1)

    const catalog = add("");
    const pagesObj = add("");
    const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    const kids: number[] = [];
    for (const p of this.pages) {
      const stream = p.ops.join("\n");
      const content = add(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
      kids.push(
        add(
          `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${num(p.width)} ${num(p.height)}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${content} 0 R >>`,
        ),
      );
    }
    objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
    objects[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;

    const d = this.info.creationDate ?? new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const pdfDate = `(D:${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z)`;
    const infoEntries = [
      this.info.title ? `/Title ${infoString(this.info.title)}` : "",
      this.info.author ? `/Author ${infoString(this.info.author)}` : "",
      this.info.subject ? `/Subject ${infoString(this.info.subject)}` : "",
      `/Producer ${infoString("AUREA")}`,
      `/CreationDate ${pdfDate}`,
    ].filter(Boolean);
    const info = add(`<< ${infoEntries.join(" ")} >>`);

    // Cabeçalho com um comentário binário (indica aos programas que o ficheiro não é texto).
    const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n%", "latin1"), Buffer.from([0xe2, 0xe3, 0xcf, 0xd3, 0x0a])];
    let offset = chunks.reduce((s, c) => s + c.length, 0);
    const offsets: number[] = [];
    objects.forEach((body, i) => {
      const chunk = Buffer.from(`${i + 1} 0 obj\n${body}\nendobj\n`, "latin1");
      offsets.push(offset);
      offset += chunk.length;
      chunks.push(chunk);
    });
    const xref = [
      "xref",
      `0 ${objects.length + 1}`,
      "0000000000 65535 f ",
      ...offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n `),
      "trailer",
      `<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>`,
      "startxref",
      String(offset),
      "%%EOF",
      "",
    ].join("\n");
    chunks.push(Buffer.from(xref, "latin1"));
    return new Uint8Array(Buffer.concat(chunks));
  }
}
