import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { checkYouTubeOEmbed, describePlayerError, parseYouTubeUrl } from "@/lib/youtube";

const ID = "dQw4w9WgXcQ";

describe("parseYouTubeUrl — URLs válidos", () => {
  it.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}&t=42s`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=abc`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube-nocookie.com/embed/${ID}`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/live/${ID}`,
    `https://music.youtube.com/watch?v=${ID}`,
    `  https://www.youtube.com/watch?v=${ID}  `,
  ])("%s", (url) => {
    const r = parseYouTubeUrl(url);
    expect(r).toEqual({ ok: true, videoId: ID, canonicalUrl: `https://www.youtube.com/watch?v=${ID}` });
  });
});

describe("parseYouTubeUrl — URLs inválidos", () => {
  it.each([
    ["", /Indique/],
    ["não é url", /inválido/],
    ["javascript:alert(1)", /http/],
    [`https://vimeo.com/${ID}`, /YouTube/],
    [`https://youtube.com.evil.com/watch?v=${ID}`, /YouTube/],
    ["https://www.youtube.com/watch?v=curto", /vídeo válido/],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ<script>", /vídeo válido/],
    ["https://www.youtube.com/playlist?list=PL123", /Playlists/],
    ["https://www.youtube.com/@canal", /vídeo válido/],
  ])("%s", (url, msg) => {
    const r = parseYouTubeUrl(url);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(msg);
  });
});

describe("verificação oEmbed (vídeo privado, indisponível, sem incorporação)", () => {
  const mk = (status: number, body: unknown = {}) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  it("vídeo público e incorporável", async () => {
    const r = await checkYouTubeOEmbed(ID, mk(200, { title: "Chuva", author_name: "Canal", thumbnail_url: "https://i.ytimg.com/x.jpg" }));
    expect(r).toEqual({ ok: true, title: "Chuva", authorName: "Canal", thumbnailUrl: "https://i.ytimg.com/x.jpg" });
  });
  it("vídeo privado ou removido", async () => {
    expect(await checkYouTubeOEmbed(ID, mk(404))).toEqual({ ok: false, reason: "not_found" });
  });
  it("incorporação desativada pelo proprietário", async () => {
    expect(await checkYouTubeOEmbed(ID, mk(401))).toEqual({ ok: false, reason: "not_embeddable" });
  });
  it("falha de rede", async () => {
    const f = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await checkYouTubeOEmbed(ID, f)).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("mensagens de erro do leitor", () => {
  it("traduz os códigos oficiais", () => {
    expect(describePlayerError(100)).toMatch(/removido ou é privado/);
    expect(describePlayerError(101)).toMatch(/não permite/);
    expect(describePlayerError(150)).toMatch(/não permite/);
    expect(describePlayerError(2)).toMatch(/inválido/);
    expect(describePlayerError(999)).toMatch(/Não foi possível/);
  });
});
