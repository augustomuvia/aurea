/**
 * Modelos de e-mail da AUREA.
 *
 * O texto (assunto, título, corpo e botão) é editável no painel; o que aqui está
 * é a versão original, usada enquanto o admin não guardar outra. O bloco de
 * detalhes (valores, datas, referências) e o destino do botão são definidos em
 * código: o admin não consegue remover informação obrigatória nem apontar o
 * botão para um endereço externo.
 */

export type TemplateKey =
  | "welcome"
  | "payment_requested"
  | "payment_under_review"
  | "admin_payment_requested"
  | "admin_payment_confirmed"
  | "plan_activated"
  | "expiring_10"
  | "expiring_5"
  | "expiring_3"
  | "expiring_1"
  | "expired";

export interface TemplateContent {
  subject: string;
  heading: string;
  body: string;
  cta_label: string;
}

export interface TemplateDef {
  key: TemplateKey;
  name: string;
  audience: "customer" | "admin";
  /** Quando é enviado (mostrado no painel). */
  trigger: string;
  /** Opção em Configurações que liga/desliga este e-mail. */
  flag: NotificationEmailFlag;
  /** Variável com o destino do botão (sempre um link interno da AUREA). */
  ctaLink: VarName;
  /** Variáveis que o assunto ou o corpo têm de manter. */
  required: VarName[];
  /** Linhas do quadro de detalhes, geradas automaticamente. */
  details: [label: string, v: VarName][];
  /** Nota final fixa (segurança, renovação manual, etc.). */
  footnote?: string;
  defaults: TemplateContent;
}

export type NotificationEmailFlag =
  | "welcome"
  | "payment_requested"
  | "payment_under_review"
  | "admin_payment_requested"
  | "admin_payment_confirmed"
  | "plan_activated"
  | "expiring"
  | "expired";

/** Variáveis documentadas. A descrição aparece no editor. */
export const VARIABLES = {
  saudacao: "“Olá, Ana” ou “Olá” quando o nome não é conhecido",
  nome: "Primeiro nome do cliente",
  nome_completo: "Nome completo do cliente",
  email: "E-mail do cliente",
  plano: "Nome do plano ou produto",
  duracao: "Duração do plano (ex.: 3 meses)",
  valor: "Montante em Kz",
  referencia_pagamento: "Referência do pedido (AUR-…)",
  id_pedido: "Identificador interno do pedido",
  data_pedido: "Data e hora do pedido",
  estado: "Estado atual do pedido",
  metodo: "Método de pagamento",
  mcx_numero: "Número Multicaixa Express configurado no painel",
  mcx_titular: "Titular configurado no painel",
  instrucoes_pagamento: "Instruções de pagamento configuradas no painel",
  transacao: "Identificador da transação confirmada",
  data_confirmacao: "Data e hora da confirmação",
  estado_anterior: "Estado anterior do pagamento",
  data_ativacao: "Data de início do período",
  data_expiracao: "Data exata de expiração",
  dias_restantes: "Dias que faltam até à expiração",
  id_utilizador: "Identificador do utilizador",
  id_assinatura: "Identificador da assinatura",
  link_conta: "Ligação para a conta",
  link_biblioteca: "Ligação para a biblioteca",
  link_assinatura: "Ligação para a assinatura",
  link_pagamento: "Ligação para o estado do pedido",
  link_planos: "Ligação para os planos",
  link_suporte: "Ligação para o suporte",
  link_admin: "Ligação para o registo no painel",
  email_suporte: "Endereço de suporte",
} as const;

export type VarName = keyof typeof VARIABLES;
export type Vars = Partial<Record<VarName, string>>;

const COMMON: VarName[] = ["saudacao", "nome", "nome_completo", "email", "link_conta", "link_suporte", "email_suporte", "link_planos", "link_biblioteca", "link_assinatura"];
const PAYMENT: VarName[] = ["plano", "duracao", "valor", "referencia_pagamento", "id_pedido", "data_pedido", "estado", "metodo", "link_pagamento"];
const SUBSCRIPTION: VarName[] = ["plano", "duracao", "data_expiracao", "dias_restantes", "id_assinatura"];

const RENEWAL_NOTE =
  "A renovação da AUREA é manual: não é feita nenhuma cobrança automática. Para continuar, escolha um plano e conclua o pagamento por Multicaixa Express.";

function expiring(days: 10 | 5 | 3 | 1, subject: string, heading: string, body: string): TemplateDef {
  return {
    key: `expiring_${days}` as TemplateKey,
    name: `Aviso de expiração · ${days} ${days === 1 ? "dia" : "dias"}`,
    audience: "customer",
    trigger: `Diariamente, quando falta${days === 1 ? "" : "m"} ${days} ${days === 1 ? "dia" : "dias"} para a data de expiração (Africa/Luanda).`,
    flag: "expiring",
    ctaLink: "link_assinatura",
    required: ["data_expiracao"],
    details: [
      ["Plano", "plano"],
      ["Válido até", "data_expiracao"],
      ["Dias restantes", "dias_restantes"],
    ],
    footnote: RENEWAL_NOTE,
    defaults: { subject, heading, body, cta_label: "Consultar a minha assinatura" },
  };
}

export const TEMPLATES: Record<TemplateKey, TemplateDef> = {
  welcome: {
    key: "welcome",
    name: "Boas-vindas",
    audience: "customer",
    trigger: "Quando o cliente confirma o e-mail da conta nova (uma única vez por conta).",
    flag: "welcome",
    ctaLink: "link_conta",
    required: [],
    details: [],
    footnote: "Se não criou esta conta, ignore este e-mail ou escreva-nos para {{email_suporte}}. Nenhum pagamento foi feito em seu nome.",
    defaults: {
      subject: "Bem-vindo à AUREA — a sua experiência começa aqui",
      heading: "Bem-vindo à AUREA",
      body: [
        "{{saudacao}},",
        "Obrigado por criar a sua conta. A AUREA é uma biblioteca de experiências sonoras para relaxar, meditar, concentrar-se e descansar melhor.",
        "A sua conta já está pronta. A biblioteca premium e as restantes funcionalidades ficam disponíveis assim que tiver uma assinatura ativa: pode escolher o plano que preferir na sua conta, quando quiser.",
        "Se precisar de ajuda, a nossa equipa responde em {{link_suporte}}.",
      ].join("\n\n"),
      cta_label: "Entrar na minha conta",
    },
  },

  payment_requested: {
    key: "payment_requested",
    name: "Pedido de pagamento",
    audience: "customer",
    trigger: "Quando o cliente cria um pedido de pagamento.",
    flag: "payment_requested",
    ctaLink: "link_pagamento",
    required: ["referencia_pagamento"],
    details: [
      ["Pedido", "referencia_pagamento"],
      ["Plano", "plano"],
      ["Valor a pagar", "valor"],
      ["Data do pedido", "data_pedido"],
      ["Estado", "estado"],
      ["Método", "metodo"],
      ["Número Multicaixa Express", "mcx_numero"],
      ["Titular", "mcx_titular"],
      ["Instruções", "instrucoes_pagamento"],
    ],
    footnote: "O acesso só fica ativo depois de a equipa AUREA confirmar a receção do pagamento. Receberá um e-mail quando isso acontecer.",
    defaults: {
      subject: "Pedido de pagamento recebido — AUREA",
      heading: "Recebemos o seu pedido",
      body: [
        "{{saudacao}},",
        "Registámos o seu pedido {{referencia_pagamento}} para o plano {{plano}}. O pagamento está pendente.",
        "Para concluir, envie {{valor}} por Multicaixa Express para o número indicado abaixo e use a referência do pedido na descrição, se possível.",
        "Depois de pagar, abra o estado do pedido e envie o comprovativo (PNG, JPG ou PDF) ou o identificador da transação. Isso ajuda-nos a verificar mais depressa.",
        "Aguarde a nossa confirmação antes de considerar o acesso ativo.",
      ].join("\n\n"),
      cta_label: "Ver o estado do pedido",
    },
  },

  payment_under_review: {
    key: "payment_under_review",
    name: "Pagamento pendente de validação",
    audience: "customer",
    trigger: "Quando o cliente envia o comprovativo ou o identificador da transação (uma vez por pedido).",
    flag: "payment_under_review",
    ctaLink: "link_pagamento",
    required: ["referencia_pagamento"],
    details: [
      ["Pedido", "referencia_pagamento"],
      ["Plano", "plano"],
      ["Valor", "valor"],
      ["Estado", "estado"],
    ],
    footnote: "Ainda não confirmámos o pagamento. Receberá um e-mail quando a verificação estiver concluída.",
    defaults: {
      subject: "Estamos a verificar o seu pagamento — AUREA",
      heading: "Comprovativo recebido",
      body: [
        "{{saudacao}},",
        "Recebemos os dados do pagamento do pedido {{referencia_pagamento}}. A nossa equipa vai verificar a receção do valor.",
        "Não precisa de fazer mais nada por agora.",
      ].join("\n\n"),
      cta_label: "Ver o estado do pedido",
    },
  },

  admin_payment_requested: {
    key: "admin_payment_requested",
    name: "Novo pedido pendente (administração)",
    audience: "admin",
    trigger: "Quando um cliente cria um pedido de pagamento, se a opção estiver ativa.",
    flag: "admin_payment_requested",
    ctaLink: "link_admin",
    required: ["referencia_pagamento"],
    details: [
      ["Estado", "estado"],
      ["Pedido", "referencia_pagamento"],
      ["Cliente", "nome_completo"],
      ["E-mail", "email"],
      ["Plano", "plano"],
      ["Valor", "valor"],
      ["Criado em", "data_pedido"],
    ],
    footnote: "Isto é um pedido pendente, não um pagamento confirmado. Confirme apenas depois de verificar a receção no extrato.",
    defaults: {
      subject: "[AUREA] Novo pedido pendente — {{referencia_pagamento}}",
      heading: "Novo pedido pendente",
      body: "Foi criado o pedido {{referencia_pagamento}} ({{plano}}, {{valor}}). O pagamento ainda não foi verificado.",
      cta_label: "Abrir no painel",
    },
  },

  admin_payment_confirmed: {
    key: "admin_payment_confirmed",
    name: "Pagamento confirmado (administração)",
    audience: "admin",
    trigger: "Quando um pagamento é confirmado por um administrador ou por um prestador de pagamentos verificado.",
    flag: "admin_payment_confirmed",
    ctaLink: "link_admin",
    required: ["referencia_pagamento"],
    details: [
      ["Estado", "estado"],
      ["Estado anterior", "estado_anterior"],
      ["Cliente", "nome_completo"],
      ["E-mail", "email"],
      ["ID do utilizador", "id_utilizador"],
      ["Referência", "referencia_pagamento"],
      ["Transação", "transacao"],
      ["ID do pedido", "id_pedido"],
      ["Plano", "plano"],
      ["Montante confirmado", "valor"],
      ["Método", "metodo"],
      ["Confirmado em", "data_confirmacao"],
      ["ID da assinatura", "id_assinatura"],
      ["Válida até", "data_expiracao"],
    ],
    defaults: {
      subject: "[AUREA] Pagamento confirmado — {{referencia_pagamento}}",
      heading: "Pagamento confirmado",
      body: "O pagamento {{referencia_pagamento}} foi confirmado e a assinatura de {{nome_completo}} está ativa.",
      cta_label: "Abrir no painel",
    },
  },

  plan_activated: {
    key: "plan_activated",
    name: "Plano ativado",
    audience: "customer",
    trigger: "Depois de o pagamento ser confirmado e a assinatura ficar gravada como ativa.",
    flag: "plan_activated",
    ctaLink: "link_biblioteca",
    required: ["data_expiracao"],
    details: [
      ["Plano", "plano"],
      ["Duração", "duracao"],
      ["Ativação", "data_ativacao"],
      ["Expira em", "data_expiracao"],
      ["Referência", "referencia_pagamento"],
    ],
    footnote: RENEWAL_NOTE,
    defaults: {
      subject: "O seu plano AUREA está ativo!",
      heading: "Está tudo pronto",
      body: [
        "{{saudacao}},",
        "A sua assinatura AUREA foi ativada com sucesso. Entre na sua conta para explorar a biblioteca de experiências sonoras e descobrir os conteúdos disponíveis no seu plano.",
        "O seu plano {{plano}} é válido até {{data_expiracao}}. Pode consultar a assinatura em {{link_assinatura}}.",
      ].join("\n\n"),
      cta_label: "Abrir a biblioteca",
    },
  },

  expiring_10: expiring(
    10,
    "A sua assinatura AUREA termina daqui a {{dias_restantes}} dias",
    "Faltam {{dias_restantes}} dias",
    [
      "{{saudacao}},",
      "A sua assinatura {{plano}} termina em {{data_expiracao}}, daqui a {{dias_restantes}} dias.",
      "Até lá, continua a ter acesso a toda a biblioteca. Se quiser manter a sua rotina sem interrupções, pode ver as opções de renovação na sua conta com tempo.",
      "Obrigado por fazer parte da AUREA.",
    ].join("\n\n"),
  ),
  expiring_5: expiring(
    5,
    "Faltam {{dias_restantes}} dias para terminar a sua assinatura AUREA",
    "A sua assinatura termina em breve",
    [
      "{{saudacao}}.",
      "A sua assinatura AUREA termina dentro de {{dias_restantes}} dias, em {{data_expiracao}}.",
      "Até essa data, poderá continuar a utilizar as funcionalidades abrangidas pelo seu plano. Se quiser continuar a explorar a biblioteca sem interrupções, poderá consultar as opções de renovação na sua conta.",
      "Obrigado por fazer parte da AUREA.",
    ].join("\n\n"),
  ),
  expiring_3: expiring(
    3,
    "A sua assinatura AUREA está perto de expirar",
    "Está quase no fim do seu plano",
    [
      "{{saudacao}},",
      "Faltam {{dias_restantes}} dias: a sua assinatura {{plano}} termina em {{data_expiracao}}.",
      "Se quiser continuar a ouvir os seus conteúdos favoritos, pode renovar já ou escolher outro plano. O tempo que ainda tem não se perde: um novo período começa a contar a partir da data de expiração atual.",
      "Obrigado por fazer parte da AUREA.",
    ].join("\n\n"),
  ),
  expiring_1: expiring(
    1,
    "Último dia da sua assinatura AUREA",
    "Último dia do seu plano",
    [
      "{{saudacao}},",
      "A sua assinatura {{plano}} termina em {{data_expiracao}}.",
      "Se quiser continuar a usar a biblioteca, renove hoje pela sua conta. Se preferir fazer uma pausa, não precisa de fazer nada: o acesso premium termina nessa data e a sua conta continua disponível.",
      "Obrigado por fazer parte da AUREA.",
    ].join("\n\n"),
  ),

  expired: {
    key: "expired",
    name: "Plano expirado (opcional)",
    audience: "customer",
    trigger: "Depois de a assinatura expirar de facto, se a opção estiver ativa.",
    flag: "expired",
    ctaLink: "link_planos",
    required: [],
    details: [
      ["Plano", "plano"],
      ["Terminou em", "data_expiracao"],
    ],
    footnote: RENEWAL_NOTE,
    defaults: {
      subject: "A sua assinatura AUREA terminou",
      heading: "O seu plano terminou",
      body: [
        "{{saudacao}},",
        "A sua assinatura {{plano}} terminou em {{data_expiracao}}. A sua conta, favoritos e histórico continuam guardados.",
        "Quando quiser voltar, basta escolher um plano.",
      ].join("\n\n"),
      cta_label: "Ver os planos",
    },
  },
};

export const TEMPLATE_KEYS = Object.keys(TEMPLATES) as TemplateKey[];

export function isTemplateKey(v: unknown): v is TemplateKey {
  return typeof v === "string" && v in TEMPLATES;
}

/** Variáveis que fazem sentido em cada modelo (as restantes são recusadas). */
export function allowedVars(key: TemplateKey): VarName[] {
  const t = TEMPLATES[key];
  const set = new Set<VarName>([...COMMON, t.ctaLink, ...t.required, ...t.details.map(([, v]) => v)]);
  if (key.startsWith("payment") || key.startsWith("admin_payment")) PAYMENT.forEach((v) => set.add(v));
  if (key === "admin_payment_confirmed" || key === "plan_activated" || key.startsWith("expir")) SUBSCRIPTION.forEach((v) => set.add(v));
  if (key === "plan_activated") ["referencia_pagamento", "valor", "data_ativacao"].forEach((v) => set.add(v as VarName));
  if (t.audience === "admin") ["link_admin", "id_utilizador", "transacao", "data_confirmacao", "estado_anterior"].forEach((v) => set.add(v as VarName));
  if (key === "payment_requested") ["mcx_numero", "mcx_titular", "instrucoes_pagamento"].forEach((v) => set.add(v as VarName));
  return [...set];
}

/** Limites do que o admin pode alterar no aspeto dos e-mails. */
export const DESIGN_BUTTONS = { dark: "Preto com texto branco", gold: "Dourado com texto preto" } as const;
export type DesignButton = keyof typeof DESIGN_BUTTONS;
