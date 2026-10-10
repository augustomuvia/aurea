# Pagamentos — Multicaixa Express

O único método apresentado ao cliente é **Multicaixa Express**. Não existem cartões, PayPal, Stripe ou outros métodos na interface.

## Fluxo implementado

1. O cliente escolhe um plano (`/checkout/[plano]`).
2. O servidor chama `create_payment_order`: valor e duração vêm da tabela `plans`; é gerada uma referência única `AUR-XXXXXXXX`. Pedidos pendentes recentes do mesmo plano são reutilizados (sem duplicados).
3. `/checkout/estado?ref=…` mostra valor exato, referência e o número Multicaixa Express do destinatário (configurado em **Admin → Configurações → Pagamentos**).
4. O cliente paga na app Multicaixa Express, com a referência na descrição, e indica o identificador da transação do comprovativo (`report_payment`). **Isto não ativa nada.**
5. Confirmação:
   - **Modo provisório (`PAYMENT_MODE=manual_review`, atual)**: o super admin verifica a receção no extrato/notificação bancária e confirma em **Admin → Pagamentos → [referência]**, indicando o identificador verificado e a evidência (texto obrigatório, mínimo 10 caracteres, e caixa “verifiquei a receção”). Fica auditado.
   - **Modo parceiro (`PAYMENT_MODE=partner`)**: o parceiro chama `POST /api/payments/webhook/partner`; a assinatura é verificada e a notificação normalizada segue para a mesma função.
6. `confirm_payment` (SQL, atómico): bloqueia o pedido, recusa referência inexistente, valor diferente, transação já usada, pedido não pendente e eventos duplicados; ativa/estende a assinatura (`subscription_periods`), regista `payment_events`, cria notificação e, se configurado, envia e-mail.
7. Expiração: o acesso é negado em tempo real quando `expires_at` passa; o cron horário (`/api/cron/expire`) sincroniza estados e expira pedidos pendentes com mais de 7 dias.

Não há renovação automática nem cobranças recorrentes.

## Integrar um parceiro (quando houver contrato)

Não há endpoints de parceiro no código, de propósito. Para integrar:

1. Obter do parceiro licenciado: especificação oficial (criação de pagamento/referência, callback, formato e assinatura), credenciais de sandbox e produção.
2. Implementar `PaymentProvider` em `src/lib/payments/providers/` (`describeCheckout` e `parseWebhook`), mapeando o formato do parceiro para `NormalizedNotification` e verificando a assinatura (`verifySignature` serve como base se o parceiro usar HMAC-SHA256).
3. Registar o adaptador em `getProvider("partner")`.
4. Configurar `PAYMENT_WEBHOOK_SECRET` e o URL `https://<domínio>/api/payments/webhook/partner` no painel do parceiro.
5. Testar em sandbox: pagamento confirmado, falhado, duplicado, valor incorreto, referência inválida, assinatura inválida.
6. Só então mudar `PAYMENT_MODE=partner` em produção e fazer um pagamento real de verificação.

A integração financeira **não deve ser considerada concluída** antes do passo 6.
