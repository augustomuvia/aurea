# Deploy na Vercel

## 1. Supabase
1. Criar projeto (região mais próxima disponível, por exemplo `eu-west`).
2. Aplicar migrações: `supabase link --project-ref <ref> && supabase db push`.
3. Executar `supabase/seed.sql` uma vez (planos 5.000 / 12.000 / 30.000 Kz, categorias, configurações).
4. Configurar Auth conforme o README (URLs, templates, SMTP, MFA TOTP).

## 2. Vercel
1. Importar o repositório `augustomuvia/aurea` (framework Next.js, comandos por omissão).
2. Em **Settings → Environment Variables**, definir as variáveis da tabela do README para *Production* (e *Preview* com um projeto Supabase separado, se possível).
3. `CRON_SECRET`: gerar um valor aleatório longo (`openssl rand -hex 32`). O cron em `vercel.json` corre de hora a hora.
4. Deploy.

## 3. Domínio
1. Verificar disponibilidade antes de comprar. Em 10/10/2026: `aurea.com`, `aurea.app` e `aureasound.com` estavam ocupados; `aureasound.net/.org/.shop/.store` estavam disponíveis. Domínios `.ao`/`.co.ao` são geridos pelo DNS.ao e devem ser verificados lá.
2. Vercel → **Domains** → adicionar o domínio e configurar os registos DNS indicados.
3. Atualizar `NEXT_PUBLIC_SITE_URL` e as URLs do Supabase Auth para o domínio final.

## 4. Primeiro acesso
1. Registar a conta do proprietário e confirmar o e-mail.
2. `npm run admin:bootstrap` (ver README).
3. `/admin` → ativar o autenticador → **Configurações**: número Multicaixa Express, contactos, dados legais.
4. Adicionar os primeiros conteúdos em **Conteúdos → Adicionar**.

## 5. Checklist antes de produção
- [ ] `npm test`, `npm run typecheck` e `npm run build` sem erros.
- [ ] Registo → e-mail de confirmação → login → recuperação de palavra-passe testados no domínio final.
- [ ] Conteúdo aberto reproduz sem assinatura; premium bloqueado sem assinatura (testar também via `curl` à API REST com o token de um utilizador sem plano).
- [ ] Pedido de pagamento → confirmação no admin → acesso ativo; rejeição → sem acesso.
- [ ] `/admin` devolve 404 para um utilizador comum e exige TOTP ao proprietário.
- [ ] Cron executado com sucesso (Vercel → Cron Jobs).
- [ ] Backups do Supabase ativos.
- [ ] Textos legais revistos por um jurista; dados legais preenchidos.
- [ ] Safari iPhone, Chrome Android, Safari e Chrome macOS testados.

Nunca executar migrações destrutivas em produção sem backup e plano de reversão; as migrações novas devem ser aditivas.
