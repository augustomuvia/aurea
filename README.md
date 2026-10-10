# AUREA

Plataforma premium de experiências sonoras (relaxamento, meditação, concentração, sono e frequências de referência), com assinaturas pagas em kwanzas por **Multicaixa Express** e painel exclusivo do proprietário.

> A AUREA é um serviço de bem-estar. Não faz alegações clínicas e não substitui aconselhamento médico.

## Arquitetura

| Camada | Tecnologia | Onde |
|---|---|---|
| Web | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4 | `src/app` |
| Dados e autenticação | Supabase (PostgreSQL + RLS, Auth com MFA TOTP) | `supabase/migrations` |
| Reprodução | YouTube IFrame Player API (modo `youtube-nocookie`) | `src/components/player` |
| Pagamentos | Multicaixa Express: modo provisório de verificação manual + interface para parceiro | `src/lib/payments`, funções SQL |
| E-mail | Resend (opcional) para e-mails da app; Supabase SMTP para e-mails de autenticação | `src/lib/email.ts` |
| Hosting | Vercel (+ Vercel Cron para expirações) | `vercel.json` |

Módulos:

```
src/app/(site)          interface pública, autenticação, checkout, legal, suporte
src/app/app             área do utilizador (biblioteca, conteúdo, favoritos, histórico, assinatura, pagamentos, conta)
src/app/admin           painel super admin (dashboard, utilizadores, conteúdos, assinaturas, pagamentos, planos, configurações, auditoria)
src/app/api             exportação de dados, CSV financeiro, cron de expiração, webhook do parceiro
src/components/player   motor de reprodução (provider + mini-player persistente + player expandido)
src/lib                 serviços: auth, catálogo, assinaturas, pagamentos, validação, rate limiting, auditoria, e-mail
supabase/migrations     esquema, máquinas de estado, RLS e funções privilegiadas
tests/db                testes das regras de negócio e segurança contra o SQL real (PGlite)
tests/unit              testes de validação, YouTube, preços, webhooks
```

### Princípios de segurança

- **Tudo o que dá acesso é decidido na base de dados.** O vídeo de um conteúdo premium (`content_media`) só é devolvido pela RLS a quem tem assinatura ativa (`has_premium_access`). Nenhum cookie, campo de formulário ou pedido manual o desbloqueia.
- **O cliente nunca escreve campos privilegiados.** Papéis, estado/expiração de assinaturas e pagamentos não têm permissões de escrita para `anon`/`authenticated`; só funções `SECURITY DEFINER` executáveis pelo `service_role` os alteram.
- **Pagamentos atómicos e idempotentes** (`confirm_payment`): valor e plano vêm da BD, referência única, bloqueio de linha, recusa de valor errado, transação reutilizada, notificação duplicada e confirmações repetidas. Todas as tentativas ficam em `payment_events`.
- **Histórico financeiro e auditoria são append-only** (triggers impedem `DELETE`/`UPDATE`). Correções fazem-se por reversão auditada.
- **Máquinas de estado na BD** para assinaturas e pagamentos (transições impossíveis são rejeitadas).
- **Admin**: papel `super_admin` numa tabela própria, verificado no servidor em cada página e ação, MFA TOTP obrigatório (`ADMIN_REQUIRE_MFA`), utilizadores comuns recebem 404 em `/admin`.
- Rate limiting persistente em login, registo, recuperação, pedidos de pagamento, suporte e exportações.
- Cabeçalhos de segurança (HSTS, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`), proteção contra open redirect, CSV com neutralização de fórmulas, Server Actions com proteção CSRF nativa do Next.js.

## Desenvolvimento local

Requisitos: Node 20+, um projeto Supabase (ou `supabase start` com a CLI e Docker).

```bash
npm install
cp .env.example .env.local   # preencher as variáveis
# aplicar migrações e seed (CLI Supabase):
supabase link --project-ref <ref>
supabase db push
psql "$DATABASE_URL" -f supabase/seed.sql   # ou cole o ficheiro no SQL Editor
npm run dev
```

Testes e verificações:

```bash
npm test          # 83 testes: regras de pagamento, RLS, privilégios, YouTube, preços, webhooks
npm run typecheck
npm run build
```

Os testes de base de dados executam as migrações reais num PostgreSQL em memória (PGlite) com uma réplica mínima dos papéis do Supabase — não precisam de rede nem de credenciais.

## Configuração do Supabase

1. **Auth → Providers → Email**: ativo, com "Confirm email" ligado.
2. **Auth → URL Configuration**: Site URL = `NEXT_PUBLIC_SITE_URL`; Redirect URLs: `https://<domínio>/auth/confirm`.
3. **Auth → Email Templates** (fluxo SSR):
   - Confirm signup: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/app`
   - Reset password: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`
   - Traduza os textos para português.
4. **Auth → SMTP**: configure um SMTP próprio (por exemplo o do Resend) para não ficar limitado ao envio de teste do Supabase.
5. **Auth → Multi-Factor**: TOTP ativo.
6. **Auth → Rate limits / Attack protection**: mantenha os limites ativos e, se possível, CAPTCHA.
7. **Backups**: ative backups diários (e PITR no plano Pro). Ver `docs/OPERACOES.md`.

## Primeiro super admin

1. Registe a conta do proprietário em `/registar` e confirme o e-mail.
2. Localmente, com as variáveis do servidor:
   ```bash
   SUPER_ADMIN_EMAIL=dono@exemplo.ao NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run admin:bootstrap
   ```
3. Entre em `/admin`: é pedida a ativação do autenticador (TOTP).

Não existe nenhum caminho na interface para atribuir `super_admin`.

## Deploy na Vercel

Ver [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Pagamentos Multicaixa Express

Ver [`docs/PAGAMENTOS.md`](docs/PAGAMENTOS.md). Resumo: a app arranca em **modo provisório** (pedido pendente → cliente paga por Multicaixa Express → admin confirma com evidência verificável). A integração automática com um parceiro só deve ser ligada depois de implementar o adaptador com a especificação oficial e testar o fluxo real.

## Variáveis de ambiente

| Variável | Onde | Obrigatória | Descrição |
|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | cliente+servidor | sim | URL pública, sem barra final |
| `NEXT_PUBLIC_SUPABASE_URL` | cliente+servidor | sim | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | cliente+servidor | sim | chave pública (anon) |
| `SUPABASE_SERVICE_ROLE_KEY` | **só servidor** | sim | chave service role |
| `ADMIN_REQUIRE_MFA` | servidor | recomendado | `true` (por omissão) exige TOTP no `/admin` |
| `CRON_SECRET` | servidor | sim | protege `/api/cron/expire` (Vercel envia-o automaticamente) |
| `RESEND_API_KEY`, `EMAIL_FROM` | servidor | não | e-mails da aplicação (confirmação de pagamento) |
| `PAYMENT_MODE` | servidor | sim | `manual_review` até existir parceiro integrado |
| `PAYMENT_WEBHOOK_SECRET` | servidor | só com parceiro | segredo de verificação dos callbacks |
| `SUPER_ADMIN_EMAIL` | local | só no bootstrap | e-mail do primeiro admin |

## Limitações conhecidas (honestas)

- **YouTube**: o leitor oficial exige o vídeo visível durante a reprodução, por isso não há reprodução em segundo plano nem com o ecrã bloqueado; ao recolher o mini-player para a barra compacta, a reprodução pausa. Anúncios e marcas do YouTube podem aparecer. A visualização de ondas é decorativa (o YouTube não expõe o sinal de áudio).
- **Pagamentos**: sem parceiro integrado, a confirmação é manual. Nenhuma ativação acontece por o cliente indicar que pagou.
- **Textos legais**: são modelos base para revisão jurídica (Lei n.º 22/11 de Proteção de Dados Pessoais e restante legislação angolana).
