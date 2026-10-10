import { formatKz } from "@/lib/pricing";
import { PdfDocument, wrapText, A4, type Rgb } from "@/lib/pdf/writer";
import { fmtDate, planDuration, type JobPayload } from "@/lib/notifications/vars";

/**
 * Recibo de pagamento em PDF, gerado no momento (nada é guardado).
 *
 * É um comprovativo de pagamento e não uma fatura: em Angola, as faturas têm de
 * ser emitidas por software de faturação certificado pela AGT. Por isso o
 * documento chama-se "Recibo de pagamento" e diz que não substitui a fatura.
 * Só mostra dados que existem na base de dados; os dados da empresa (nome, NIF,
 * morada) aparecem apenas se estiverem preenchidos nas configurações ("legal").
 */

export interface ReceiptData {
  reference: string;
  issuedAt: Date;
  customerName: string;
  customerEmail: string;
  planName: string;
  durationMonths: number | null;
  amountMinor: number | string | bigint;
  method: string;
  transactionId: string | null;
  createdAt: string | null;
  confirmedAt: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  siteUrl: string;
  supportEmail: string;
  company?: { name?: string | null; nif?: string | null; address?: string | null };
  /** Envio de teste com dados fictícios: o documento fica marcado como demonstração. */
  demo?: boolean;
}

export const RECEIPT_TITLE = "Recibo de pagamento";
export const RECEIPT_DISCLAIMER = "Documento emitido pela AUREA como comprovativo de pagamento. Não substitui fatura fiscal.";

export function receiptFilename(reference: string) {
  return `Recibo-${reference.replace(/[^A-Za-z0-9-]/g, "")}.pdf`;
}

const TZ = "Africa/Luanda";
const shortDate = new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: TZ });
const shortDateTime = new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TZ });
const d = (v: string | Date | null | undefined) => (v ? shortDate.format(new Date(v)) : "");
const dt = (v: string | Date | null | undefined) => (v ? `${shortDateTime.format(new Date(v))} (Luanda)` : "");

const METHOD: Record<string, string> = { multicaixa_express: "Multicaixa Express" };

const INK: Rgb = [0.043, 0.043, 0.059];
const TEXT: Rgb = [0.165, 0.165, 0.2];
const MUTE: Rgb = [0.42, 0.42, 0.46];
const LINE: Rgb = [0.925, 0.902, 0.847];
const GOLD: Rgb = [0.722, 0.569, 0.247];
const GOLD_SOFT: Rgb = [0.969, 0.945, 0.89];
const DEMO: Rgb = [0.75, 0.2, 0.2];

export function buildReceiptPdf(r: ReceiptData): Uint8Array {
  const doc = new PdfDocument({ title: `${RECEIPT_TITLE} ${r.reference}`, author: "AUREA", subject: RECEIPT_DISCLAIMER, creationDate: r.issuedAt });
  const p = doc.addPage();
  const L = 56;
  const R = A4.width - 56;
  const W = R - L;
  const amount = formatKz(BigInt(r.amountMinor));
  const site = r.siteUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const duration = planDuration(r.durationMonths);

  // Cabeçalho: marca à esquerda, título e número à direita.
  p.text("AUREA", L, 78, { font: "bold", size: 22, color: INK, charSpacing: 5 });
  p.rect(L, 90, 40, 2, { fill: GOLD });
  let cy = 108;
  const company = r.company ?? {};
  for (const line of [company.name, company.nif ? `NIF ${company.nif}` : null, company.address].filter((v): v is string => !!v && !!v.trim())) {
    for (const l of wrapText(line.trim(), "regular", 8.5, 230)) {
      p.text(l, L, cy, { size: 8.5, color: MUTE });
      cy += 11;
    }
  }
  p.text(RECEIPT_TITLE, R, 74, { font: "bold", size: 18, color: INK, align: "right" });
  p.text(`N.º ${r.reference}`, R, 92, { font: "bold", size: 10.5, color: TEXT, align: "right" });
  p.text(`Data de emissão: ${d(r.issuedAt)}`, R, 106, { size: 9, color: MUTE, align: "right" });
  if (r.demo) p.text("DEMONSTRAÇÃO · DADOS FICTÍCIOS · SEM VALOR", R, 120, { font: "bold", size: 8.5, color: DEMO, align: "right" });

  // Cliente e pagamento.
  let y = Math.max(cy, 132) + 22;
  p.line(L, y - 14, R, y - 14, { color: LINE });
  p.text("CLIENTE", L, y, { font: "bold", size: 7.5, color: MUTE, charSpacing: 1.2 });
  p.text("PAGAMENTO", L + W / 2, y, { font: "bold", size: 7.5, color: MUTE, charSpacing: 1.2 });
  let ly = y + 16;
  for (const l of wrapText(r.customerName || r.customerEmail, "bold", 11, W / 2 - 16).slice(0, 2)) {
    p.text(l, L, ly, { font: "bold", size: 11, color: INK });
    ly += 14;
  }
  if (r.customerName) p.text(r.customerEmail, L, ly, { size: 9.5, color: TEXT });
  p.text("Pago", L + W / 2, y + 16, { font: "bold", size: 11, color: INK });
  p.text(r.confirmedAt ? `Confirmado em ${dt(r.confirmedAt)}` : "", L + W / 2, y + 30, { size: 9.5, color: TEXT });
  p.text(METHOD[r.method] ?? r.method, L + W / 2, y + 44, { size: 9.5, color: TEXT });

  // Quadro do artigo.
  y += 76;
  p.rect(L, y, W, 24, { fill: GOLD_SOFT });
  p.text("Descrição", L + 12, y + 16, { font: "bold", size: 9, color: INK });
  p.text("Valor", R - 12, y + 16, { font: "bold", size: 9, color: INK, align: "right" });
  y += 24;
  p.text(`Assinatura AUREA · Plano ${r.planName}${duration ? ` (${duration})` : ""}`, L + 12, y + 20, { font: "bold", size: 10.5, color: INK });
  p.text(amount, R - 12, y + 20, { font: "bold", size: 10.5, color: INK, align: "right" });
  const period = r.periodStart && r.periodEnd ? `Período de acesso: ${fmtDate(r.periodStart)} a ${fmtDate(r.periodEnd)}` : "Acesso premium à biblioteca AUREA";
  p.text(period, L + 12, y + 35, { size: 9, color: MUTE });
  y += 50;
  p.line(L, y, R, y, { color: LINE });
  p.text("Total pago", R - 140, y + 22, { font: "bold", size: 12, color: INK, align: "right" });
  p.text(amount, R - 12, y + 22, { font: "bold", size: 12, color: INK, align: "right" });
  p.rect(R - 128, y + 30, 116, 1.5, { fill: GOLD });

  // Detalhes.
  y += 64;
  p.text("DETALHES DO PAGAMENTO", L, y, { font: "bold", size: 7.5, color: MUTE, charSpacing: 1.2 });
  y += 8;
  const rows: [string, string][] = (
    [
      ["Referência do pedido", r.reference],
      ["Método de pagamento", METHOD[r.method] ?? r.method],
      ["ID da transação", r.transactionId ?? ""],
      ["Data do pedido", dt(r.createdAt)],
      ["Data de confirmação", dt(r.confirmedAt)],
      ["Início do período", r.periodStart ? fmtDate(r.periodStart) : ""],
      ["Fim do período", r.periodEnd ? fmtDate(r.periodEnd) : ""],
      ["Moeda", "Kwanza (AOA)"],
    ] as [string, string][]
  ).filter(([, v]) => v.trim() !== "");
  rows.forEach(([label, value], i) => {
    const top = y + i * 22;
    if (i) p.line(L, top, R, top, { color: LINE, width: 0.5 });
    p.text(label, L, top + 15, { size: 9, color: MUTE });
    p.text(value, L + 160, top + 15, { size: 9.5, color: INK });
  });
  y += rows.length * 22;
  p.line(L, y, R, y, { color: LINE, width: 0.5 });

  y += 34;
  for (const l of wrapText("Obrigado por fazer parte da AUREA. Guarde este recibo para os seus registos. Para qualquer questão sobre este pagamento, indique a referência acima.", "regular", 9.5, W)) {
    p.text(l, L, y, { size: 9.5, color: TEXT });
    y += 14;
  }

  // Rodapé.
  const fy = A4.height - 70;
  p.line(L, fy, R, fy, { color: LINE });
  p.text(`AUREA · ${site} · ${r.supportEmail}`, A4.width / 2, fy + 18, { font: "bold", size: 8.5, color: INK, align: "center" });
  p.text(RECEIPT_DISCLAIMER, A4.width / 2, fy + 32, { size: 8, color: MUTE, align: "center" });
  return doc.toBytes();
}

/** Recibo a partir dos dados gravados num trabalho de e-mail (usado nos envios de teste). */
export function receiptFromPayload(payload: JobPayload, ctx: { siteUrl: string; supportEmail: string; demo?: boolean; now?: Date }): ReceiptData {
  return {
    reference: payload.reference ?? "AUR-DEMO0000",
    issuedAt: ctx.now ?? new Date(),
    customerName: (payload.nome ?? "").trim(),
    customerEmail: payload.email ?? "",
    planName: payload.plan ?? "",
    durationMonths: payload.duration_months ?? null,
    amountMinor: payload.amount_minor ?? 0,
    method: payload.method ?? "multicaixa_express",
    transactionId: payload.transaction_id ?? null,
    createdAt: payload.created_at ?? null,
    confirmedAt: payload.confirmed_at ?? null,
    periodStart: payload.period_start ?? payload.starts_at ?? null,
    periodEnd: payload.expires_at ?? null,
    siteUrl: ctx.siteUrl,
    supportEmail: ctx.supportEmail,
    demo: ctx.demo,
  };
}
