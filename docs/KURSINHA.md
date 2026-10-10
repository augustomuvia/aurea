# Kursinha → acesso AUREA

Clientes podem pagar a AUREA na Kursinha (app.kursinha.com). Cada venda aprovada ativa ou estende
o plano automaticamente, através do webhook oficial da Kursinha
([WEBHOOKS_GUIDE.md](https://github.com/kursinha1/kursinha-docs/blob/main/WEBHOOKS_GUIDE.md)).

## Como funciona

1. A Kursinha envia `POST https://www.aurea-som.site/api/payments/webhook/kursinha` com `sale.pending`, `sale.approved` ou `sale.cancelled`.
2. O servidor verifica a autenticidade (ver abaixo), valida o corpo e chama `kursinha_handle_event` (SQL, só `service_role`).
3. **sale.approved**: escolhe o plano ativo cujo preço é **exatamente** o valor do produto (`data.product.price`, em Kz) e procura a conta pelo **e-mail do comprador**, que tem de estar confirmado. Cria um pagamento (`provider = kursinha`) e confirma-o pelo mesmo `confirm_payment` dos outros pagamentos (assinatura, período, recibo e e-mails).
   - Sem conta com esse e-mail: a venda fica **À espera de conta** e é aplicada sozinha quando o cliente criar conta e confirmar esse e-mail.
   - Valor sem plano correspondente (ex.: venda do e-book): fica **Sem plano com este preço** e gera um alerta no painel.
4. **sale.cancelled** depois de ativada (estorno/reembolso): o período concedido é revertido e o admin é avisado. Cancelada é final.
5. **sale.pending**: só é registada.

Entregas repetidas (`event + saleId`) respondem 200 sem efeito; eventos fora de ordem não estragam o estado.
Tudo fica visível em **Admin → Kursinha**, com um botão “Tentar de novo” para vendas à espera de conta ou sem plano.

## Configuração

Na Kursinha (**Webhooks → Adicionar**): URL acima, eventos **Compra aprovada**, **Compra pendente** e **Compra cancelada**, estado **Ativo**.
Um produto por plano, com o preço igual ao do plano na AUREA (Mensal 5.000 Kz, Trimestral 12.000 Kz, Anual 30.000 Kz).

Na Vercel (variáveis de ambiente):

| Variável | Uso |
| --- | --- |
| `KURSINHA_WEBHOOK_SECRET` | O mesmo valor do campo **Secret** do webhook na Kursinha (mín. 16 caracteres). Verifica `X-Webhook-Signature: sha256=HMAC(corpo)`. Preferível. |
| `KURSINHA_WEBHOOK_TOKEN` | Só se a Kursinha não deixar definir o Secret: token aleatório (mín. 32) e URL `…/kursinha?token=<token>`. Ignorado quando há `KURSINHA_WEBHOOK_SECRET`. |
| `KURSINHA_PRODUCT_IDS` | Opcional: IDs dos produtos Kursinha que dão acesso, separados por vírgulas. |

Sem nenhuma das duas primeiras, o endereço responde 503 e nada é processado.

Migração: executar `supabase/migrations/20261010000600_kursinha.sql` uma vez no SQL Editor do Supabase.

## Verificação antes de vender

1. Fazer uma compra de teste na Kursinha com um e-mail que já tem conta confirmada na AUREA.
2. Confirmar em **Admin → Kursinha** que aparece “Plano ativado”, e nos registos do webhook da Kursinha que a resposta foi 200.
3. Se aparecer “Sem plano com este preço” com um valor 100× maior, a Kursinha está a enviar cêntimos: avisar para ajustar a conversão em `src/lib/payments/kursinha.ts` (a documentação não indica a unidade; assume-se Kz).

Limitação: a Kursinha não tem renovação automática nem eventos de assinatura; cada compra é um período novo.
