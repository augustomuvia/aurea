/** Imagens da página do e-book: capa e pré-visualizações (PNG, JPG ou WebP, até 3 MB). */
export const EBOOK_MEDIA_MAX_BYTES = 3 * 1024 * 1024;
export type ImageKind = { mime: "image/png" | "image/jpeg" | "image/webp"; ext: "png" | "jpg" | "webp" };

/** Identifica o formato pelo conteúdo do ficheiro, não pela extensão. */
export function detectImageKind(head: Uint8Array): ImageKind | null {
  const at = (sig: number[], offset = 0) => sig.every((b, i) => head[offset + i] === b);
  if (at([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: "image/png", ext: "png" };
  if (at([0xff, 0xd8, 0xff])) return { mime: "image/jpeg", ext: "jpg" };
  if (at([0x52, 0x49, 0x46, 0x46]) && at([0x57, 0x45, 0x42, 0x50], 8)) return { mime: "image/webp", ext: "webp" };
  return null;
}

/** Caminhos gerados pelo servidor: cover/<hex>.<ext> ou previews/<hex>.<ext>. */
export const EBOOK_MEDIA_PATH = /^(cover|previews)\/[a-f0-9]{16}\.(png|jpg|webp)$/;
