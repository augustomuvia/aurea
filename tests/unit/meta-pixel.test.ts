import { describe, expect, it } from "vitest";
import { META_PIXEL_ID, pixelSkipped } from "@/lib/meta-pixel";

describe("meta pixel", () => {
  it("usa o pixel da conta por omissão", () => {
    expect(META_PIXEL_ID).toBe("950520914582617");
  });

  it("não mede admin, e-book nem a página offline", () => {
    expect(pixelSkipped("/admin")).toBe(true);
    expect(pixelSkipped("/admin/notificacoes")).toBe(true);
    expect(pixelSkipped("/ebook/x")).toBe(true);
    expect(pixelSkipped("/offline")).toBe(true);
    expect(pixelSkipped("/")).toBe(false);
    expect(pixelSkipped("/checkout/anual")).toBe(false);
    expect(pixelSkipped("/administracao")).toBe(false);
  });
});
