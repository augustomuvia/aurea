export const CATEGORY_LABEL: Record<string, string> = { conta: "Conta", pagamento: "Pagamento", assinatura: "Assinatura", biblioteca: "Biblioteca" };

export const JOB_STATUS_LABEL: Record<string, string> = {
  queued: "Na fila",
  processing: "Em processamento",
  sent: "Enviado pelo serviço",
  failed: "Falhou",
  retry_scheduled: "Nova tentativa programada",
  skipped: "Não enviado",
};

export const EVENT_LABEL: Record<string, string> = {
  "user.registered": "Conta criada",
  "payment.requested": "Pedido de pagamento",
  "payment.proof_submitted": "Comprovativo recebido",
  "payment.confirmed": "Pagamento confirmado",
  "subscription.activated": "Plano ativado",
  "subscription.expiring": "Aviso de expiração",
  "subscription.expired": "Assinatura expirada",
  "integration.verification": "Verificação da integração",
  test: "Envio de teste",
};

export const JOB_STATUS_TONE = { queued: "neutral", processing: "gold", sent: "ok", failed: "danger", retry_scheduled: "warn", skipped: "neutral" } as const;
