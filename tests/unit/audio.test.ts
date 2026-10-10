import { describe, expect, it } from "vitest";
import { DEFAULT_COVER, themedCover, titleFromFileName } from "@/lib/audio";

describe("áudio próprio: títulos e capas", () => {
  it("gera títulos legíveis a partir do nome do ficheiro", () => {
    expect(titleFromFileName("01-chuva-suave.mp3")).toBe("Chuva suave");
    expect(titleFromFileName("05-tom-432hz.mp3")).toBe("Tom 432 Hz");
    expect(titleFromFileName("binaural_alfa_10hz.M4A")).toBe("Binaural alfa 10 Hz");
    expect(titleFromFileName("123.mp3")).toBe("123");
  });
  it("escolhe a capa pelo tema do título", () => {
    expect(themedCover("Binaural alfa 10 Hz")).toBe("/covers/binaural.jpg");
    expect(themedCover("Chuva suave")).toBe("/covers/chuva.jpg");
    expect(themedCover("Ondas do mar")).toBe("/covers/mar.jpg");
    expect(themedCover("Foco profundo · ruído castanho")).toBe("/covers/foco.jpg");
    expect(themedCover("Binaural gama 40 Hz")).toBe("/covers/binaural.jpg");
    expect(themedCover("Tom 528 Hz")).toBe("/covers/tons.jpg");
    expect(themedCover("Silêncio")).toBe(DEFAULT_COVER);
  });
});
