/** Comprovativos de pagamento: limites e deteção do tipo real pelo conteúdo do ficheiro. */
export const PROOF_BUCKET = "payment-proofs";
export const PROOF_MAX_BYTES = 4 * 1024 * 1024;

export type ProofKind = { mime: "image/png" | "image/jpeg" | "application/pdf"; ext: "png" | "jpg" | "pdf" };

/**
 * Identifica PNG, JPG ou PDF pelos primeiros bytes (assinatura do formato).
 * Não confia na extensão nem no tipo declarado pelo navegador.
 */
export function detectProofKind(head: Uint8Array): ProofKind | null {
  const starts = (sig: number[]) => sig.every((b, i) => head[i] === b);
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: "image/png", ext: "png" };
  if (starts([0xff, 0xd8, 0xff])) return { mime: "image/jpeg", ext: "jpg" };
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return { mime: "application/pdf", ext: "pdf" };
  return null;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}
