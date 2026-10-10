import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { PdfDocument, textWidth, toWinAnsi, wrapText } from "@/lib/pdf/writer";
import { buildReceiptPdf, receiptFilename, receiptFromPayload, RECEIPT_DISCLAIMER, type ReceiptData } from "@/lib/receipts/receipt";
import { samplePayload } from "@/lib/notifications/vars";

const latin1 = (b: Uint8Array) => Buffer.from(b).toString("latin1");
const hexOf = (s: string) => toWinAnsi(s).map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join("");

/** Valida a estrutura: cabeçalho, startxref a apontar para a xref e cada entrada para "N 0 obj". */
function checkStructure(bytes: Uint8Array) {
  const s = latin1(bytes);
  expect(s.startsWith("%PDF-1.4\n")).toBe(true);
  expect(s.trimEnd().endsWith("%%EOF")).toBe(true);
  const startxref = Number(/startxref\n(\d+)\n%%EOF/.exec(s)?.[1]);
  expect(s.slice(startxref, startxref + 5)).toBe("xref\n");
  const [, first, count] = /^xref\n(\d+) (\d+)\n/.exec(s.slice(startxref))!.map(Number);
  expect(first).toBe(0);
  const entries = s.slice(startxref).split("\n").slice(2, 2 + count);
  expect(entries[0]).toBe("0000000000 65535 f ");
  entries.slice(1).forEach((e, i) => {
    expect(e).toMatch(/^\d{10} 00000 n $/);
    const off = Number(e.slice(0, 10));
    expect(s.slice(off, off + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`);
  });
  expect(s).toMatch(new RegExp(`trailer\\n<< /Size ${count} /Root 1 0 R`));
  // Comprimento declarado de cada stream = bytes entre "stream\n" e "\nendstream".
  for (const m of s.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
    const start = m.index! + m[0].length;
    expect(s.slice(start + Number(m[1]), start + Number(m[1]) + 10)).toBe("\nendstream");
  }
  return s;
}

const receipt: ReceiptData = {
  reference: "AUR-7K2M9QXA",
  issuedAt: new Date("2026-10-10T10:00:00Z"),
  customerName: "Conceição Gonçalves Antunes",
  customerEmail: "conceicao@exemplo.ao",
  planName: "Trimestral",
  durationMonths: 3,
  amountMinor: 1200000,
  method: "multicaixa_express",
  transactionId: "MCX-883201",
  createdAt: "2026-10-09T13:20:00Z",
  confirmedAt: "2026-10-09T14:32:00Z",
  periodStart: "2026-10-09T14:32:00Z",
  periodEnd: "2027-01-09T14:32:00Z",
  siteUrl: "https://www.aurea-som.site",
  supportEmail: "suporte@aurea-som.site",
};

describe("PDF mínimo", () => {
  it("gera um PDF 1.4 com xref e startxref corretos", () => {
    const doc = new PdfDocument({ title: "Teste ção" });
    doc.addPage().text("Olá", 50, 50).line(10, 10, 100, 10).rect(10, 20, 50, 20, { fill: [1, 0, 0] });
    doc.addPage().text("Segunda página", 50, 50, { font: "bold", align: "right" });
    const s = checkStructure(doc.toBytes());
    expect(s).toContain("/BaseFont /Helvetica /Encoding /WinAnsiEncoding");
    expect(s).toContain("/BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding");
    expect(s).toContain("/Count 2");
  });

  it("codifica acentos e símbolos em WinAnsi e escreve-os em hexadecimal", () => {
    expect(toWinAnsi("ção")).toEqual([0xe7, 0xe3, 0x6f]);
    expect(toWinAnsi("€ — “x” º")).toEqual([0x80, 0x20, 0x97, 0x20, 0x93, 0x78, 0x94, 0x20, 0xba]);
    expect(toWinAnsi("日")).toEqual([0x3f]);
    // Decomposto (NFD) é normalizado: "ã" = a + til combinante.
    expect(toWinAnsi("ã")).toEqual([0xe3]);
    const doc = new PdfDocument();
    doc.addPage().text("Não substitui (fatura) \\ fiscal", 10, 10);
    const s = latin1(doc.toBytes());
    expect(s).toContain(`<${hexOf("Não substitui (fatura) \\ fiscal")}> Tj`);
    expect(s).toContain("E3"); // ã
  });

  it("mede larguras com as métricas da Helvetica e quebra linhas", () => {
    expect(textWidth("AAAA", "regular", 10)).toBeCloseTo(26.68, 2);
    expect(textWidth("i", "bold", 10)).toBeCloseTo(2.78, 2);
    const lines = wrapText("uma frase bastante comprida para caber numa linha estreita", "regular", 10, 80);
    expect(lines.length).toBeGreaterThan(2);
    for (const l of lines) expect(textWidth(l, "regular", 10)).toBeLessThanOrEqual(80);
  });
});

describe("recibo de pagamento", () => {
  it("contém título, número, cliente, plano, valor, datas, contactos e a nota de que não é fatura", () => {
    const bytes = buildReceiptPdf(receipt);
    const s = checkStructure(bytes);
    if (process.env.RECEIPT_SAMPLE_OUT) writeFileSync(process.env.RECEIPT_SAMPLE_OUT, bytes);
    for (const t of [
      "Recibo de pagamento",
      "N.º AUR-7K2M9QXA",
      "Data de emissão: 10/10/2026",
      "Conceição Gonçalves Antunes",
      "conceicao@exemplo.ao",
      "Assinatura AUREA · Plano Trimestral (3 meses)",
      "12.000 Kz",
      "Multicaixa Express",
      "MCX-883201",
      "Período de acesso: 9 de outubro de 2026 a 9 de janeiro de 2027",
      "AUREA · www.aurea-som.site · suporte@aurea-som.site",
      RECEIPT_DISCLAIMER,
    ]) {
      expect(s, t).toContain(`<${hexOf(t)}>`);
    }
    expect(s).not.toContain(hexOf("Fatura-recibo"));
    expect(s).not.toContain(hexOf("NIF"));
    expect(bytes.length).toBeLessThan(30_000);
  });

  it("mostra os dados da empresa só quando estão configurados", () => {
    const s = latin1(buildReceiptPdf({ ...receipt, company: { name: "AUREA Lda", nif: "5000000000", address: "" } }));
    expect(s).toContain(`<${hexOf("AUREA Lda")}>`);
    expect(s).toContain(`<${hexOf("NIF 5000000000")}>`);
  });

  it("envio de teste fica marcado como demonstração", () => {
    const s = latin1(buildReceiptPdf(receiptFromPayload(samplePayload("payment_receipt"), { siteUrl: "https://www.aurea-som.site", supportEmail: "suporte@aurea-som.site", demo: true })));
    expect(s).toContain(hexOf("DEMONSTRAÇÃO"));
    expect(s).toContain(`<${hexOf("N.º AUR-DEMO0000")}>`);
  });

  it("nome do ficheiro seguro", () => {
    expect(receiptFilename("AUR-7K2M9QXA")).toBe("Recibo-AUR-7K2M9QXA.pdf");
    expect(receiptFilename('AUR-"x/../y')).toBe("Recibo-AUR-xy.pdf");
  });
});
