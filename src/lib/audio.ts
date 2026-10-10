/** Bucket privado com os áudios próprios dos conteúdos (ver migração 20261010000900). */
export const CONTENT_AUDIO_BUCKET = "content-audio";
/** Limite por ficheiro (igual ao do bucket). */
export const CONTENT_AUDIO_MAX_BYTES = 50 * 1024 * 1024;
export const CONTENT_AUDIO_TYPES = ["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/aac"] as const;

/** URL estável que o leitor usa; o servidor verifica o acesso e redireciona para um URL assinado. */
/** Capa dos conteúdos só com áudio que não têm capa própria. */
export const DEFAULT_COVER = "/covers/aurea.jpg";

/**
 * Capas temáticas em public/covers, escolhidas pelo nome do ficheiro no envio em massa.
 * A ordem importa: a primeira palavra encontrada ganha.
 */
export const THEMED_COVERS: [RegExp, string][] = [
  [/binaural|alfa|alpha|teta|theta|delta|beta/i, "binaural"],
  [/chuva|rain|tempestade/i, "chuva"],
  [/mar|onda|ocean|praia|agua|água|rio|spa/i, "mar"],
  [/foco|castanho|brown|rosa|pink|ruido|ruído|noise|estudo/i, "foco"],
  [/hz|tom|tone|frequ/i, "tons"],
];

/** Capa para um conteúdo sem capa própria nem vídeo do YouTube, pelo tema do título. */
export function themedCover(title: string) {
  const hit = THEMED_COVERS.find(([re]) => re.test(title));
  return hit ? `/covers/${hit[1]}.jpg` : DEFAULT_COVER;
}

/** "01-tom-432hz.mp3" → "Tom 432 Hz". */
export function titleFromFileName(name: string) {
  const base = name
    .replace(/\.[a-z0-9]{2,4}$/i, "")
    .replace(/^\d{1,3}[\s._-]+/, "")
    .replace(/[_-]+/g, " ")
    .replace(/(\d+)\s?hz\b/gi, "$1 Hz")
    .replace(/\s+/g, " ")
    .trim();
  return (base.charAt(0).toUpperCase() + base.slice(1)).slice(0, 140) || "Som AUREA";
}

export const audioSrc = (contentId: string) => `/api/audio/${contentId}`;
