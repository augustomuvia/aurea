import "server-only";
import type { NormalizedNotification } from "@/lib/payments/webhook";

/**
 * Contrato de um prestador de pagamentos Multicaixa Express.
 *
 * Só existe hoje o modo "manual_review" (provisório): o cliente paga por
 * Multicaixa Express para o destinatário configurado no painel e o super admin
 * confirma com base numa evidência verificável (extrato/notificação bancária).
 *
 * Para ligar um parceiro real: implementar `PaymentProvider` com a especificação
 * oficial (criação de pedido, formato e assinatura do webhook) e registá-lo em
 * `getProvider`. Nenhum endpoint de parceiro está codificado aqui de propósito.
 */
export interface PaymentProvider {
  id: "manual_review" | "partner";
  /** Instruções/ação apresentadas ao cliente depois de criado o pedido. */
  describeCheckout(input: { reference: string; amountMinor: number }): Promise<{ kind: "manual_instructions" } | { kind: "redirect"; url: string }>;
  /** Converte o pedido HTTP do parceiro numa notificação normalizada (após verificar a assinatura). */
  parseWebhook?(req: { rawBody: string; headers: Headers }): Promise<{ ok: true; notification: NormalizedNotification } | { ok: false; reason: string }>;
}

const manualReview: PaymentProvider = {
  id: "manual_review",
  async describeCheckout() {
    return { kind: "manual_instructions" };
  },
};

export function getProvider(mode: "manual_review" | "partner"): PaymentProvider {
  if (mode === "partner") {
    throw new Error(
      "PAYMENT_MODE=partner requer um adaptador implementado com a especificação oficial do parceiro Multicaixa Express. Veja docs/PAGAMENTOS.md.",
    );
  }
  return manualReview;
}
