-- Áudio próprio por conteúdo (MP3/M4A carregado pelo admin).
-- Toca num elemento <audio>, que continua com o ecrã bloqueado ou fora do navegador,
-- ao contrário do leitor do YouTube. Fica em content_media, por isso só quem pode
-- reproduzir o conteúdo (RLS content_media_entitled) vê o caminho do ficheiro.
alter table public.content_media
  add column if not exists audio_path text
    check (audio_path is null or audio_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,100}$');

-- Bucket privado: os ficheiros só são servidos por URLs assinados criados no servidor.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('content-audio', 'content-audio', false, 52428800, array['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac'])
    on conflict (id) do update
      set public = false,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;
