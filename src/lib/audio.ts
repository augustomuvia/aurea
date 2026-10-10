/** Bucket privado com os áudios próprios dos conteúdos (ver migração 20261010000900). */
export const CONTENT_AUDIO_BUCKET = "content-audio";
/** Limite por ficheiro (igual ao do bucket). */
export const CONTENT_AUDIO_MAX_BYTES = 50 * 1024 * 1024;
export const CONTENT_AUDIO_TYPES = ["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/aac"] as const;

/** URL estável que o leitor usa; o servidor verifica o acesso e redireciona para um URL assinado. */
export const audioSrc = (contentId: string) => `/api/audio/${contentId}`;
