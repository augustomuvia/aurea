-- Conteúdos só com áudio próprio (sons originais AUREA), sem vídeo do YouTube.
-- Cada conteúdo continua a precisar de pelo menos uma fonte: YouTube ou áudio.
alter table public.content_items alter column youtube_video_id drop not null;
alter table public.content_media alter column youtube_url drop not null;
alter table public.content_media alter column youtube_video_id drop not null;
alter table public.content_media drop constraint if exists content_media_has_source;
alter table public.content_media
  add constraint content_media_has_source check (youtube_video_id is not null or audio_path is not null);
