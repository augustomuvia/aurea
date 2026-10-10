-- AUREA · 50 conteúdos longos (todos com mais de 25 minutos)
-- Cole no Supabase > SQL Editor e execute. Pode ser executado mais de uma vez sem duplicar nada:
-- ignora slugs já existentes e vídeos do YouTube que já estejam no catálogo.
-- Cada vídeo foi confirmado como público e incorporável via oEmbed do YouTube em 2026-10-10.
-- A duração indicada nas descrições é a declarada pelo canal no título do vídeo.

begin;

create temporary table _aurea_novos (
  video_id text, slug text, title text, description text, hz numeric, binaural boolean,
  cats text[], uses text[], tags text[]
) on commit drop;

insert into _aurea_novos values
  ('9IybdYAHZ0w', '528-hz-tom-puro-3h', '528 Hz · Tom puro prolongado', 'Tom contínuo identificado pelo autor como 528 Hz, com cerca de três horas e meia. Fundo sonoro simples para descansar.', 528, false, array['frequencias','relaxamento']::text[], array['relaxamento']::text[], array['528hz','tom-puro','longo']::text[]),
  ('9363cn8Cc8s', '528-hz-ambiente-3h', '528 Hz · Ambiente suave', 'Ambiente musical lento com frequência declarada de 528 Hz, cerca de três horas.', 528, false, array['frequencias','relaxamento']::text[], array['relaxamento','sono']::text[], array['528hz','ambiente']::text[]),
  ('FqnmPdQDP-4', '528-639-hz-noite-9h', '528 + 639 Hz · Noite em ecrã escuro', 'Música serena com frequências declaradas de 528 e 639 Hz, cerca de nove horas, com ecrã escuro para a noite.', 528, false, array['frequencias','sono']::text[], array['sono']::text[], array['528hz','639hz','ecra-escuro','noite']::text[]),
  ('YWYVuS7Ec8A', '432-hz-harmonia-8h', '432 Hz · Harmonia natural', 'Música calma afinada a 432 Hz segundo o autor, cerca de oito horas para longas sessões de descanso.', 432, false, array['frequencias','sono']::text[], array['sono','relaxamento']::text[], array['432hz','longo']::text[]),
  ('FQRiD67tU8M', '396-hz-instrumental-3h', '396 Hz · Instrumental de equilíbrio', 'Peças instrumentais suaves com frequência declarada de 396 Hz, cerca de três horas.', 396, false, array['frequencias','relaxamento']::text[], array['relaxamento','meditacao']::text[], array['396hz','instrumental']::text[]),
  ('TvDcYGkOPf0', '396-639-963-hz-12h', '396 · 639 · 963 Hz · Sessão de 12 horas', 'Sequência longa com as frequências declaradas 396, 639 e 963 Hz, cerca de doze horas para meditação ou noite.', 396, false, array['frequencias','sono']::text[], array['sono','meditacao']::text[], array['396hz','639hz','963hz','longo']::text[]),
  ('d3HUGlwIKs0', '639-hz-musica-1h', '639 Hz · Música serena', 'Uma hora de música calma com frequência declarada de 639 Hz.', 639, false, array['frequencias','relaxamento']::text[], array['relaxamento']::text[], array['639hz']::text[]),
  ('LsRfQU_aaUk', '639-hz-sono-9h', '639 Hz · Música para a noite', 'Música lenta para o fim do dia com frequência declarada de 639 Hz, cerca de nove horas.', 639, false, array['frequencias','sono']::text[], array['sono']::text[], array['639hz','noite']::text[]),
  ('-czAtdaLWTk', '639-hz-tom-puro-10h', '639 Hz · Tom puro em ecrã escuro', 'Tom contínuo de 639 Hz declarado pelo autor, cerca de dez horas, com ecrã escuro.', 639, false, array['frequencias','sono']::text[], array['sono']::text[], array['639hz','tom-puro','ecra-escuro']::text[]),
  ('O3AuByXd9Yo', 'nove-frequencias-solfeggio-11h', 'As nove frequências Solfeggio · 11 horas', 'Percurso longo pelas frequências declaradas 174, 285, 396, 417, 528, 639, 741, 852 e 963 Hz.', 174, false, array['frequencias','meditacao']::text[], array['meditacao','sono']::text[], array['174hz','solfeggio','longo']::text[]),
  ('DZ41u5zCr14', 'alfa-12-hz-binaural-1h', 'Alfa 12 Hz · Binaural sem música', 'Uma hora de batimento binaural alfa de 12 Hz, sem música. Use auscultadores.', null, true, array['binaurais','concentracao']::text[], array['concentracao']::text[], array['alfa','binaural','sem-musica']::text[]),
  ('tLyXLtkmEe4', 'alfa-12-hz-estudo-1h', 'Alfa 12 Hz · Estudo e trabalho', 'Uma hora de batimentos binaurais alfa (12 Hz) para acompanhar sessões de estudo. Use auscultadores.', null, true, array['binaurais','concentracao']::text[], array['concentracao']::text[], array['alfa','binaural','estudo']::text[]),
  ('vYf5NZrLbY4', 'alfa-10-hz-binaural-1h', 'Alfa 10 Hz · Binaural puro', 'Uma hora de batimento binaural alfa de 10 Hz, sem acompanhamento musical. Use auscultadores.', null, true, array['binaurais','relaxamento']::text[], array['relaxamento','meditacao']::text[], array['alfa','binaural']::text[]),
  ('zrR3reCq564', 'alfa-10-hz-ondas-1h', 'Ondas alfa 10 Hz · Uma hora', 'Batimento binaural alfa de 10 Hz durante uma hora. Use auscultadores.', null, true, array['binaurais','meditacao']::text[], array['meditacao']::text[], array['alfa','binaural']::text[]),
  ('nKlcEAfLQLM', 'foco-binaural-2h', 'Foco profundo com binaurais · 2 horas', 'Duas horas de música ambiente com batimentos binaurais para trabalho concentrado. Use auscultadores.', null, true, array['binaurais','concentracao']::text[], array['concentracao']::text[], array['binaural','foco']::text[]),
  ('6ptDxA_xzgc', 'delta-3-2-hz-oceano-8h', 'Delta 3,2 Hz · Oceano noturno', 'Batimentos binaurais delta de 3,2 Hz sobre ambiente de oceano, cerca de oito horas. Use auscultadores.', null, true, array['binaurais','sono']::text[], array['sono']::text[], array['delta','binaural','oceano']::text[]),
  ('ceP04evUN_4', 'delta-3-4-hz-noite-8h', 'Delta 3,4 Hz · Música para a noite', 'Oito horas de música lenta com batimentos binaurais delta de 3,4 Hz. Use auscultadores.', null, true, array['binaurais','sono']::text[], array['sono']::text[], array['delta','binaural','noite']::text[]),
  ('625NJ2SP6oc', 'delta-meditacao-noturna-8h', 'Delta · Meditação noturna', 'Oito horas de música meditativa com batimentos binaurais na banda delta. Use auscultadores.', null, true, array['binaurais','sono']::text[], array['sono','meditacao']::text[], array['delta','binaural']::text[]),
  ('9QneqUhCVtU', 'chuva-forte-noite-10h', 'Chuva forte à noite', 'Dez horas de chuva intensa e constante para abafar o ruído e descansar.', null, false, array['natureza','sono']::text[], array['sono']::text[], array['chuva','noite']::text[]),
  ('8plwv25NYRo', 'chuva-continua-10h', 'Chuva contínua', 'Dez horas de som de chuva estável, sem música.', null, false, array['natureza','sono']::text[], array['sono','relaxamento']::text[], array['chuva']::text[]),
  ('BSmYxnvUDHw', 'chuva-trovoada-distante-10h', 'Chuva e trovoada distante', 'Dez horas de chuva com trovões ao longe.', null, false, array['natureza','sono']::text[], array['sono']::text[], array['chuva','trovoada']::text[]),
  ('x-0Hj0MgV-M', 'chuva-acolhedora-10h', 'Chuva acolhedora', 'Dez horas de chuva contínua e suave para longas noites.', null, false, array['natureza','sono']::text[], array['sono']::text[], array['chuva']::text[]),
  ('Qbp32hXUUz0', 'chuva-ruido-branco-10h', 'Chuva como ruído de fundo', 'Dez horas de chuva confortável que funciona como ruído de fundo.', null, false, array['natureza','concentracao']::text[], array['sono','concentracao']::text[], array['chuva','ruido-de-fundo']::text[]),
  ('kcPH0l9lIrQ', 'ondas-nascer-do-sol-3h', 'Ondas ao nascer do sol', 'Três horas de mar calmo ao amanhecer.', null, false, array['natureza','relaxamento']::text[], array['relaxamento']::text[], array['mar','ondas']::text[]),
  ('lVJNxZapCNw', 'ambiente-de-praia-3h', 'Ambiente de praia', 'Três horas de ondas a rebentar na praia.', null, false, array['natureza','sono']::text[], array['sono','relaxamento']::text[], array['mar','praia']::text[]),
  ('2_dXyp6ueGE', 'ondas-calmas-3h', 'Ondas calmas', 'Três horas de mar sereno para descansar ou concentrar-se.', null, false, array['natureza','relaxamento']::text[], array['relaxamento','concentracao']::text[], array['mar','ondas']::text[]),
  ('TC_ui_lowAc', 'ondas-fundo-continuo-3h', 'Ondas em fundo contínuo', 'Três horas de ondas regulares, úteis como som de fundo.', null, false, array['natureza','sono']::text[], array['sono','concentracao']::text[], array['mar','ruido-de-fundo']::text[]),
  ('Fn4XL4uP5DQ', 'ondas-reais-amanhecer-3h', 'Ondas reais ao amanhecer', 'Três horas de gravação de mar ao nascer do dia, sem música.', null, false, array['natureza','relaxamento']::text[], array['relaxamento']::text[], array['mar','sem-musica']::text[]),
  ('kGJl7Zfqyns', 'ondas-sem-fim-3h', 'Ondas sem fim', 'Paisagem sonora de três horas com ondas contínuas.', null, false, array['natureza','concentracao']::text[], array['concentracao','relaxamento']::text[], array['mar','ondas']::text[]),
  ('3BssY7xkzDM', 'floresta-ambiente-3h', 'Floresta', 'Três horas de ambiente de floresta para descanso e relaxamento.', null, false, array['natureza','relaxamento']::text[], array['relaxamento','sono']::text[], array['floresta']::text[]),
  ('bMGwFFnVPK8', 'bosque-e-aves-3h', 'Bosque e canto de aves', 'Três horas de bosque com aves e uma aldeia ao longe.', null, false, array['natureza','relaxamento']::text[], array['relaxamento']::text[], array['floresta','aves']::text[]),
  ('He048XL1T6s', 'floresta-e-rio-3h', 'Floresta e rio', 'Três horas de floresta com aves e o correr de um rio.', null, false, array['natureza','relaxamento']::text[], array['relaxamento','concentracao']::text[], array['floresta','rio','aves']::text[]),
  ('la8W9iXFkzo', 'outono-corvos-vento-3h', 'Outono · Corvos e vento', 'Três horas de vento de outono e chamamentos de corvos, só natureza.', null, false, array['natureza','ambientes']::text[], array['relaxamento']::text[], array['vento','aves','outono']::text[]),
  ('fQ6INTO6YUA', 'canto-de-aves-3h', 'Canto de aves', 'Três horas de canto de pássaros para descanso ou trabalho.', null, false, array['natureza','concentracao']::text[], array['concentracao','relaxamento']::text[], array['aves']::text[]),
  ('of4lXBmlzT8', 'lareira-crepitante-3h', 'Lareira crepitante', 'Três horas de lenha a arder numa lareira.', null, false, array['ambientes','relaxamento']::text[], array['relaxamento']::text[], array['lareira','fogo']::text[]),
  ('oBsCiUYNvmk', 'lareira-acolhedora-3h', 'Lareira acolhedora', 'Três horas de fogo suave para o fim do dia.', null, false, array['ambientes','sono']::text[], array['sono','relaxamento']::text[], array['lareira','fogo']::text[]),
  ('2SQhsNXK_5Q', 'fogo-noturno-3h', 'Fogo noturno', 'Três horas de fogo crepitante num ambiente noturno, para meditação.', null, false, array['ambientes','meditacao']::text[], array['meditacao']::text[], array['fogo','noite']::text[]),
  ('hXtDpX4zq7Y', 'lareira-sem-musica-3h', 'Lareira sem música', 'Três horas apenas com o som do fogo, sem música.', null, false, array['ambientes','concentracao']::text[], array['concentracao','sono']::text[], array['lareira','sem-musica']::text[]),
  ('0-lhQn6sKmg', 'cosmos-eterno-3h', 'Cosmos eterno', 'Três horas de música ambiente de inspiração espacial.', null, false, array['ambientes','concentracao']::text[], array['concentracao','sono']::text[], array['espaco','ambiente']::text[]),
  ('TCGZHCC3SLs', 'gravidade-zero-3h', 'Gravidade zero', 'Três horas de ambiente espacial lento para o fim do dia.', null, false, array['ambientes','sono']::text[], array['sono']::text[], array['espaco','ambiente']::text[]),
  ('ZXND1AMPFUg', 'drone-respiracao-lenta-1h', 'Drone para respiração lenta', 'Uma hora de drone ambiente calmo, ao ritmo de uma respiração pausada.', null, false, array['meditacao','ambientes']::text[], array['meditacao']::text[], array['drone','respiracao']::text[]),
  ('CYYGvK8OAGk', 'musica-calma-1h', 'Música calma', 'Uma hora de música suave para abrandar o ritmo.', null, false, array['relaxamento']::text[], array['relaxamento']::text[], array['musica-calma']::text[]),
  ('BXbsO8exZns', 'deuter-meditacao-1h', 'Deuter · Música para meditação', 'Uma hora de música de Deuter para acompanhar a prática de meditação.', null, false, array['meditacao']::text[], array['meditacao']::text[], array['instrumental']::text[]),
  ('B6L3Y5d4mCs', 'tim-janis-natureza-1h', 'Tim Janis · Instrumental e natureza', 'Uma hora de música instrumental tranquila de Tim Janis com imagens de natureza.', null, false, array['relaxamento','natureza']::text[], array['relaxamento']::text[], array['instrumental','natureza']::text[]),
  ('riJf5eKBwf4', 'tacas-tibetanas-1h', 'Taças tibetanas · Uma hora', 'Uma hora de taças tibetanas para meditação e relaxamento.', null, false, array['meditacao']::text[], array['meditacao','relaxamento']::text[], array['tacas-tibetanas']::text[]),
  ('T4ADepGLsZc', 'tacas-tibetanas-meditacao-1h', 'Taças tibetanas · Meditação profunda', 'Uma hora de taças tibetanas com tons ressonantes.', null, false, array['meditacao']::text[], array['meditacao']::text[], array['tacas-tibetanas']::text[]),
  ('BWZllFRTq0A', 'tacas-atencao-plena-1h', 'Taças tibetanas · Atenção plena', 'Uma hora de taças tibetanas para a prática de atenção plena.', null, false, array['meditacao']::text[], array['meditacao']::text[], array['tacas-tibetanas','atencao-plena']::text[]),
  ('K99F5XMX2lc', 'tacas-tons-de-base-1h', 'Taças tibetanas · Tons de base', 'Uma hora de taças tibetanas com tons graves e estáveis.', null, false, array['meditacao','relaxamento']::text[], array['meditacao']::text[], array['tacas-tibetanas']::text[]),
  ('Qcb3iC8ZVb8', 'foco-profundo-2h', 'Foco profundo · 2 horas', 'Duas horas de música discreta para estudo e trabalho.', null, false, array['concentracao']::text[], array['concentracao']::text[], array['foco','estudo']::text[]),
  ('tENOHMrA7Ng', 'trabalho-sem-distracoes-2h', 'Trabalho sem distrações', 'Duas horas de música para trabalho profundo, sem interrupções.', null, false, array['concentracao']::text[], array['concentracao']::text[], array['foco','trabalho']::text[]);

insert into public.content_items
  (slug, title, description, declared_frequency_hz, is_binaural, youtube_video_id, status, is_premium,
   recommended_use, tags, embed_checked_at, published_at)
select n.slug, n.title, n.description, n.hz, n.binaural, n.video_id, 'published', true,
       n.uses, n.tags, now(), now()
from _aurea_novos n
where not exists (select 1 from public.content_items c where c.slug = n.slug or c.youtube_video_id = n.video_id);

insert into public.content_media (content_id, youtube_url, youtube_video_id)
select c.id, 'https://www.youtube.com/watch?v=' || n.video_id, n.video_id
from _aurea_novos n join public.content_items c on c.slug = n.slug
on conflict (content_id) do nothing;

insert into public.content_categories (content_id, category_id)
select c.id, cat.id
from _aurea_novos n
join public.content_items c on c.slug = n.slug
join public.categories cat on cat.slug = any(n.cats)
on conflict do nothing;

commit;

-- Verificação: deve mostrar 50
select count(*) as novos_publicados
from public.content_items
where youtube_video_id in ('9IybdYAHZ0w', '9363cn8Cc8s', 'FqnmPdQDP-4', 'YWYVuS7Ec8A', 'FQRiD67tU8M', 'TvDcYGkOPf0', 'd3HUGlwIKs0', 'LsRfQU_aaUk', '-czAtdaLWTk', 'O3AuByXd9Yo', 'DZ41u5zCr14', 'tLyXLtkmEe4', 'vYf5NZrLbY4', 'zrR3reCq564', 'nKlcEAfLQLM', '6ptDxA_xzgc', 'ceP04evUN_4', '625NJ2SP6oc', '9QneqUhCVtU', '8plwv25NYRo', 'BSmYxnvUDHw', 'x-0Hj0MgV-M', 'Qbp32hXUUz0', 'kcPH0l9lIrQ', 'lVJNxZapCNw', '2_dXyp6ueGE', 'TC_ui_lowAc', 'Fn4XL4uP5DQ', 'kGJl7Zfqyns', '3BssY7xkzDM', 'bMGwFFnVPK8', 'He048XL1T6s', 'la8W9iXFkzo', 'fQ6INTO6YUA', 'of4lXBmlzT8', 'oBsCiUYNvmk', '2SQhsNXK_5Q', 'hXtDpX4zq7Y', '0-lhQn6sKmg', 'TCGZHCC3SLs', 'ZXND1AMPFUg', 'CYYGvK8OAGk', 'BXbsO8exZns', 'B6L3Y5d4mCs', 'riJf5eKBwf4', 'T4ADepGLsZc', 'BWZllFRTq0A', 'K99F5XMX2lc', 'Qcb3iC8ZVb8', 'tENOHMrA7Ng');

