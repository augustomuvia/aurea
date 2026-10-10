-- Link de checkout externo (Kursinha) por plano.
-- Quando preenchido, o botão do plano leva o cliente ao checkout da Kursinha e o acesso é ativado
-- pelo webhook (20261010000600_kursinha.sql). Vazio: fluxo Multicaixa Express com verificação manual.
alter table public.plans add column if not exists checkout_url text;
alter table public.plans drop constraint if exists plans_checkout_url_https;
alter table public.plans add constraint plans_checkout_url_https
  check (checkout_url is null or (checkout_url ~ '^https://' and char_length(checkout_url) <= 2000));
