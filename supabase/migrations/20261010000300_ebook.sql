-- Página de venda do AUREA Guide (/ebook).
-- Uma única linha: rascunho (editado no admin) e versão publicada (o que o público vê).
-- Sem políticas RLS: apenas o servidor (service_role) lê e escreve.

create table if not exists public.ebook_page (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default false,
  draft jsonb not null default '{}'::jsonb,
  published jsonb,
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table public.ebook_page enable row level security;
revoke all on public.ebook_page from anon, authenticated;

-- Só pode estar ativa se existir uma versão publicada.
alter table public.ebook_page drop constraint if exists ebook_page_enabled_needs_published;
alter table public.ebook_page add constraint ebook_page_enabled_needs_published
  check (not enabled or published is not null);

create or replace function public.tg_ebook_page_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists ebook_page_touch on public.ebook_page;
create trigger ebook_page_touch before update on public.ebook_page
  for each row execute function public.tg_ebook_page_touch();

-- Imagens da página (capa e pré-visualizações). São públicas por natureza (aparecem na página),
-- mas só o servidor as carrega. O PDF do guia NÃO é guardado aqui.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('ebook-media', 'ebook-media', true, 3145728, array['image/png', 'image/jpeg', 'image/webp'])
    on conflict (id) do update
      set public = true,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;
