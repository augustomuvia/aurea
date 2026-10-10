# E-mails automáticos e notificações

Este documento descreve o sistema de notificações da AUREA e os passos de configuração que só o proprietário pode fazer (Google Workspace, Vercel, DNS, Supabase).

## Arquitetura

```
Ação na app (registo, pedido, comprovativo, aprovação)        Agendador diário (Vercel Cron 08:00 Luanda)
        │  mesma transação na base de dados                           │
        ▼                                                             ▼
 gatilhos SQL ──► emit_event() ──► notification_events      enqueue_expiry_reminders()
                       │                                              │
                       ├──► notifications (sino do cliente)  ◄────────┤
                       ├──► admin_notifications (painel)              │
                       └──► email_jobs (fila persistente) ◄───────────┘
                                   │
          envio imediato após a ação (after()) + cron diário + agendador frequente opcional
                                   ▼
          claim_email_jobs (FOR UPDATE SKIP LOCKED) → revalidação → modelo → Gmail API
                                   ▼
                  complete_email_job → email_logs, novas tentativas, alertas
```

- **Transactional outbox**: os eventos, as notificações internas e os trabalhos de e-mail são gravados por gatilhos SQL na mesma transação que a alteração de negócio. Se a confirmação de um pagamento for gravada, os e-mails correspondentes também ficam gravados; se falhar, nada fica.
- **Idempotência**: cada evento tem uma chave única (`welcome:<user>`, `payment.requested:<pagamento>`, `subscription.activated:<pagamento>`, `expiring:<assinatura>:<marco>:<expiração>`…). Cada e-mail tem `idempotency_key` única. Repetições, callbacks duplicados e processos simultâneos não geram duplicados.
- **Envio separado**: uma falha do Google nunca desfaz um pagamento nem uma assinatura. O trabalho fica na fila e é repetido (5 min, 15 min, 1 h, 6 h, 24 h; 6 tentativas). Esgotadas as tentativas, fica "Falhou", aparece um alerta no painel e o admin pode voltar a colocá-lo na fila.
- **Revalidação no envio**: antes de enviar, cada trabalho é verificado. Um aviso de expiração cuja assinatura foi renovada, prolongada, suspensa ou já expirou é descartado. Um e-mail de "pedido pendente" de um pedido já confirmado é descartado.
- **Sem simulação**: sem credenciais Google o estado é "Integração por configurar" e nada é enviado. Com credenciais, a integração só fica ativa depois de um e-mail de verificação chegar e o código ser confirmado no painel. Até lá, os e-mails ficam na fila e saem quando a integração ficar ativa, depois de revalidados (os que já não se aplicam são descartados).

### Eventos

| Evento | Quando | Cliente | Administração |
| --- | --- | --- | --- |
| `user.registered` | e-mail da conta confirmado (respeita a verificação do Supabase) | e-mail de boas-vindas + notificação | — |
| `payment.requested` | novo pedido (um pedido reutilizado não conta) | e-mail com instruções MCX do painel + notificação | alerta + e-mail opcional |
| `payment.proof_submitted` | comprovativo ou ID da transação enviado (uma vez por pedido) | e-mail "estamos a verificar" | alerta "Comprovativo recebido" |
| `payment.confirmed` | `confirm_payment` (admin ou webhook verificado) | notificação "Pagamento confirmado" | e-mail `[AUREA] Pagamento confirmado — ref` + alerta |
| `subscription.activated` | período gravado e assinatura ativa | e-mail "O seu plano AUREA está ativo!" + notificação | — |
| `subscription.expiring` | cron diário, marcos 10/5/3/1 dias (Africa/Luanda) | e-mail + notificação | — |
| `subscription.expired` | expiração real pelo fim do período (opcional, desligado por omissão) | e-mail + notificação | — |

Repetir a aprovação do mesmo pagamento devolve `already_confirmed`: não há novo período, nem novos e-mails.

### Recibo de pagamento (PDF)

O e-mail "O seu plano AUREA está ativo!" (`plan_activated`, a confirmação de pagamento ao cliente) e o envio aos clientes atuais (`payment_receipt`) levam em anexo `Recibo-AUR-XXXXXXXX.pdf`. O PDF é gerado pelo servidor no momento do envio (`src/lib/pdf/writer.ts`, sem dependências; `src/lib/receipts/`), com os dados atuais da base de dados: referência, data de emissão, cliente, plano e duração, valor em Kz, Multicaixa Express, transação, datas do pedido, da confirmação e do período. Nada é guardado. Se o pagamento tiver sido revertido entretanto, o e-mail é descartado; se o PDF não puder ser gerado, o e-mail não sai sem ele e é tentado de novo.

- O documento chama-se **"Recibo de pagamento"** e não "Fatura": em Angola, as faturas têm de ser emitidas por software de faturação certificado pela AGT. O rodapé diz "Documento emitido pela AUREA como comprovativo de pagamento. Não substitui fatura fiscal."
- Nome, NIF e morada da empresa só aparecem se estiverem preenchidos em `platform_settings` → `legal` (`company_name`, `nif`, `address`).
- O admin vê ou descarrega o recibo em `/admin/pagamentos/<id>` (pagamentos confirmados). O cliente descarrega o seu em Conta → Pagamentos ("Recibo (PDF)").
- Os envios de teste dos modelos levam um recibo marcado "DEMONSTRAÇÃO".

### Enviar aos clientes atuais (migração `20261010000500_backfill_receipts.sql`)

Para quem já estava na plataforma antes dos e-mails automáticos: `/admin/notificacoes/clientes`.

1. Executar a migração `supabase/migrations/20261010000500_backfill_receipts.sql` no SQL Editor (idempotente; só funções, sem tabelas novas nem alterações de dados).
2. A integração tem de estar **Ativa** e o modo de teste **desligado** (em modo de teste os e-mails a clientes seriam descartados).
3. A página mostra, calculado no servidor, o número exato de destinatários e alguns endereços:
   - **Boas-vindas**: contas com e-mail confirmado, ativas, sem papel de administrador, sem nenhum e-mail de boas-vindas registado.
   - **Pagamento confirmado com recibo**: pagamentos confirmados de contas ativas (sem administradores) que ainda não têm e-mail "plano ativado" nem "pagamento confirmado com recibo". Pedidos pendentes, rejeitados e revertidos ficam de fora.
4. Para enviar, escrever o número de destinatários e confirmar. Os e-mails entram na fila (chaves `backfill:welcome:<utilizador>` e `backfill:payment:<pagamento>`) e sai já um primeiro lote de 50; o resto sai nos processamentos seguintes. Repetir não duplica nada: a segunda vez mostra 0 destinatários. Fica registado na Auditoria (`notifications.backfill`).
5. Na fila, os e-mails transacionais (pedidos novos, confirmações) passam sempre à frente destes envios.

Os envios de teste nunca contam como "já recebeu". Um e-mail que falhou continua a contar: pode ser repetido no Histórico. O Google Workspace limita cada conta a cerca de 2.000 mensagens por dia.

### Avisos de expiração

- Os dias contam-se em datas de calendário de Africa/Luanda. Uma assinatura que expira dia 20 recebe avisos nos dias 10, 15, 17 e 19.
- Se um dia de processamento falhar, o aviso sai no dia seguinte com o número real de dias (janelas 10:[9,10], 5:[4,5], 3:[2,3], 1:[0,1]).
- Só assinaturas `active`, com `expires_at` no futuro e conta ativa. O cliente pode desligar os lembretes por e-mail em Conta → Notificações (a notificação interna mantém-se).

## Tabelas (migração `20261010000400_notifications.sql`)

`notification_events`, `email_jobs`, `email_logs`, `email_templates` (só os modelos editados; os originais estão em `src/lib/notifications/templates.ts`), `admin_notifications`, `notification_schedule_logs`, `email_integration_state` (sem tokens). A tabela existente `notifications` ganhou `category`, `link` e `dedupe_key`; `user_preferences` ganhou `reminder_emails`; `platform_settings` ganhou a chave `notifications`. Nenhuma tabela é acessível a clientes ou visitantes, exceto as próprias notificações (RLS).

## Configuração (passo a passo)

### 1. Supabase

1. SQL Editor → colar e executar `supabase/migrations/20261010000400_notifications.sql`. É idempotente: pode ser executada de novo sem perder dados.
2. Depois, `supabase/migrations/20261010000500_backfill_receipts.sql` (envio aos clientes atuais, prioridade da fila e revalidação dos recibos). Também idempotente. Se voltar a executar a 0400, execute de seguida a 0500 (a 0500 substitui duas funções da 0400).

### 2. Google Cloud: cliente OAuth com acesso apenas a enviar e-mails

Inicie sessão como **suporte@aurea-som.site** (ou como administrador do Google Workspace do domínio).

1. https://console.cloud.google.com → criar projeto "AUREA Email".
2. APIs e serviços → Biblioteca → **Gmail API** → Ativar.
3. Google Auth Platform (Ecrã de consentimento OAuth) → Tipo de utilizador **Interno** → nome "AUREA", e-mail de suporte `suporte@aurea-som.site`. Com "Interno" o token não expira ao fim de 7 dias (isso só acontece em apps "Externas" em modo de teste).
4. Acesso a dados → Adicionar âmbito → `https://www.googleapis.com/auth/gmail.send` (só envio; não lê a caixa de correio).
5. Clientes → Criar cliente → **Aplicação Web** → URI de redirecionamento autorizado: `https://developers.google.com/oauthplayground`. Guarde o **ID do cliente** e o **segredo do cliente**.

### 3. Obter o refresh token (uma vez)

1. Abrir https://developers.google.com/oauthplayground
2. Engrenagem (canto superior direito) → marcar **Use your own OAuth credentials** → colar o ID e o segredo do cliente.
3. Passo 1: escrever `https://www.googleapis.com/auth/gmail.send` → **Authorize APIs** → entrar como **suporte@aurea-som.site** → Permitir.
4. Passo 2: **Exchange authorization code for tokens** → copiar o **Refresh token**.

Nunca é usada nem guardada a palavra-passe da conta. Para revogar o acesso: https://myaccount.google.com/permissions (na conta suporte@) ou apagar o cliente OAuth.

### 4. Vercel → Project → Settings → Environment Variables

| Variável | Valor | Ambientes |
| --- | --- | --- |
| `EMAIL_PROVIDER` | `gmail` | Production |
| `GOOGLE_CLIENT_ID` | ID do cliente | Production |
| `GOOGLE_CLIENT_SECRET` | segredo do cliente (marcar *Sensitive*) | Production |
| `GOOGLE_REFRESH_TOKEN` | refresh token (marcar *Sensitive*) | Production |
| `CRON_SECRET` | já deve existir; se não, `openssl rand -hex 32` | Production |

Preview/Development: recomenda-se **não** definir as credenciais Google (as pré-visualizações ficam "por configurar" e não enviam nada). Se quiser testar numa preview, defina-as também em Preview e ative o **modo de teste** no painel, com os seus endereços na lista autorizada. Depois de alterar variáveis, faça um novo deploy.

### 5. DNS do domínio (Vercel → Domains → aurea-som.site → DNS Records)

Estes registos autenticam o domínio e melhoram a entrega. Se o Google Workspace já recebe e-mail em suporte@, os MX já existem.

| Tipo | Nome | Valor |
| --- | --- | --- |
| MX | `@` | `smtp.google.com` (prioridade 1) — só se ainda não existir |
| TXT | `@` | `v=spf1 include:_spf.google.com ~all` (se já houver um registo `v=spf1`, junte o `include` a esse; só pode existir um) |
| TXT | `google._domainkey` | gerado em admin.google.com → Apps → Google Workspace → Gmail → **Autenticar e-mail** → Gerar novo registo (2048 bits). Depois de publicado, carregar em **Iniciar autenticação** |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:suporte@aurea-som.site` (depois de algumas semanas sem problemas, passar a `p=quarantine`) |

Verificação: https://toolbox.googleapps.com/apps/checkmx/ com o domínio `aurea-som.site`.

### 6. Ativar no painel

1. `/admin/notificacoes` → confirmar remetente `suporte@aurea-som.site`, nome `AUREA | Suporte`, e-mail administrativo e endereço da plataforma `https://www.aurea-som.site`.
2. **Enviar e-mail de verificação** → abrir o e-mail recebido → introduzir o código → **Confirmar e ativar**. O estado passa a "Ativa".
3. Em Modelos, enviar um teste de cada modelo para o seu endereço.

Se o remetente for alterado, a integração volta a "por validar" até novo código. Um remetente diferente da conta autenticada tem de estar configurado no Gmail como alias "Enviar como".

### 7. Agendador frequente (opcional, recomendado)

O plano Hobby da Vercel só corre o cron uma vez por dia (`/api/cron/expire`, 07:00 UTC = 08:00 em Luanda; a Vercel pode executá-lo em qualquer minuto dessa hora). Isso chega para os avisos de expiração. Para que as novas tentativas de e-mails falhados não esperem pelo dia seguinte, o repositório inclui `.github/workflows/notifications-tick.yml`, que chama `/api/cron/notifications` a cada 15 minutos. Para o ativar, em GitHub → Settings → Secrets and variables → Actions, criar:

- `AUREA_SITE_URL` = `https://www.aurea-som.site` (o domínio final, sem redirecionamentos)
- `CRON_SECRET` = o mesmo valor da Vercel

Sem estes segredos o workflow termina sem fazer nada. Com ele, a "hora diária dos avisos" do painel também passa a ser respeitada (a verificação corre a partir dessa hora, uma vez por dia).

## Verificação em produção (checklist)

1. `/admin/notificacoes` mostra "Ativa", o último e-mail enviado e o agendador "Operacional" depois do primeiro cron.
2. Criar uma conta de teste com um e-mail seu → confirmar → recebe 1 e-mail de boas-vindas (Histórico: 1 linha "Enviado pelo serviço").
3. Criar um pedido → recebe o e-mail com o número MCX do painel; o admin recebe "Novo pedido pendente".
4. Aprovar o pedido em `/admin/pagamentos` → admin recebe `[AUREA] Pagamento confirmado — AUR-…`; o cliente recebe "O seu plano AUREA está ativo!"; o sino mostra as notificações.
5. Aprovar outra vez → nenhum e-mail novo.
6. Avisos: em `/admin/utilizadores/<id>` conceder acesso manual com expiração daqui a 5 dias → "Processar agora" → sai o aviso de 5 dias. Repetir "Processar agora" → nada novo.
7. Vercel → Project → Cron Jobs: o `/api/cron/expire` aparece com execuções diárias (corre sem visitas ao site).

"Enviado pelo serviço" significa que o Google aceitou a mensagem. A AUREA não marca nada como "entregue" porque o Gmail API não confirma a entrega na caixa do destinatário.

## Testes

`npm test` executa, contra as migrações reais (PGlite):

- `tests/db/notifications.test.ts`: boas-vindas única, pedido e instruções, pendente sem confirmação, aprovação (e-mails, notificações, auditoria), aprovação repetida, avisos 10/5/3/1, unicidade por marco (incluindo processamentos simultâneos), renovação, prolongamento, expirado opcional, falha do fornecedor e novas tentativas, falha definitiva e nova colocação na fila, modo de teste, isolamento entre clientes e permissões.
- `tests/unit/notifications.test.ts`: validação de modelos e variáveis, escape de HTML, datas em Africa/Luanda, MIME (com e sem anexos) e cliente Gmail API (com `fetch` simulado; não faz chamadas reais).
- `tests/unit/pdf.test.ts`: estrutura do PDF (cabeçalho, xref, startxref, comprimentos), acentos em WinAnsi e conteúdo do recibo.
- `tests/db/backfill.test.ts`: totais da pré-visualização, permissões, confirmação pelo número, idempotência (a segunda vez coloca 0), exclusão de quem já recebeu, de pagamentos não confirmados ou revertidos, prioridade da fila e envio com o PDF anexado.

Os testes 17 e 18 da especificação (deploy e agendamento em produção) só podem ser confirmados na Vercel, com a checklist acima.
