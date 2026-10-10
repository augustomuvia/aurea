import { describe, expect, it } from "vitest";
import { detectProofKind, formatBytes } from "@/lib/payments/proof";

const bytes = (...b: number[]) => new Uint8Array([...b, 0, 0, 0, 0]);

describe("deteção do tipo de comprovativo", () => {
  it("reconhece PNG, JPG e PDF pelo conteúdo", () => {
    expect(detectProofKind(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))?.ext).toBe("png");
    expect(detectProofKind(bytes(0xff, 0xd8, 0xff, 0xe0))?.ext).toBe("jpg");
    expect(detectProofKind(new TextEncoder().encode("%PDF-1.7\n"))?.mime).toBe("application/pdf");
  });

  it("recusa outros formatos, mesmo com extensão enganadora", () => {
    expect(detectProofKind(new TextEncoder().encode("<svg xmlns="))).toBeNull();
    expect(detectProofKind(new TextEncoder().encode("GIF89a"))).toBeNull();
    expect(detectProofKind(new Uint8Array())).toBeNull();
  });

  it("formata tamanhos", () => {
    expect(formatBytes(900)).toBe("900 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(3.5 * 1024 * 1024)).toBe("3,5 MB");
  });
});
