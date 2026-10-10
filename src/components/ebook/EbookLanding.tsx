import { ArrowDown, FileText, Lock, Plus } from "lucide-react";
import type { EbookConfig } from "@/lib/ebook/config";
import { formatKz } from "@/lib/pricing";
import { Book3D } from "./Cover";
import { IllustrativeSheet, PhoneMockup } from "./Mockups";
import { Reveal } from "./Reveal";

export interface EbookLandingProps {
  config: EbookConfig;
  coverUrl: string | null;
  previewUrls: string[];
  /** Destino do botão de compra (rota do servidor que redireciona para a Kursinha). Null na pré-visualização. */
  buyHref: string | null;
}

const goldButton =
  "press inline-flex min-h-13 items-center justify-center gap-2 rounded-full bg-gradient-to-b from-gold-light to-gold px-8 text-[0.82rem] font-semibold tracking-[0.16em] text-ink shadow-[0_10px_40px_-12px_rgba(214,180,106,0.6),inset_0_1px_0_rgba(255,255,255,0.45)] hover:brightness-[1.05] hover:shadow-[0_14px_50px_-12px_rgba(214,180,106,0.75),inset_0_1px_0_rgba(255,255,255,0.5)]";

function Paragraphs({ text, className = "" }: { text: string; className?: string }) {
  return (
    <>
      {text
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p, i) => (
          <p key={i} className={className}>
            {p}
          </p>
        ))}
    </>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-[0.68rem] font-medium uppercase tracking-[0.32em] text-gold/90">{children}</p>;
}

export function EbookLanding({ config: c, coverUrl, previewUrls, buyHref }: EbookLandingProps) {
  const price = formatKz(c.priceMinor);
  return (
    <div className="relative isolate overflow-x-clip">
      <noscript>
        <style>{".ebook-reveal{opacity:1!important;transform:none!important}"}</style>
      </noscript>
      {/* Fundo: preto profundo com reflexos dourados muito suaves */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[120svh] bg-[radial-gradient(60%_50%_at_75%_20%,rgba(214,180,106,0.10),transparent_70%),radial-gradient(50%_40%_at_10%_0%,rgba(240,220,165,0.05),transparent_70%)]" />

      <header className="mx-auto hidden max-w-6xl items-center justify-between px-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:flex sm:px-8">
        <span className="text-[0.72rem] font-medium uppercase tracking-[0.38em] text-paper/80">
          Aurea <span className="text-gold">Guide</span>
        </span>
        <span className="hidden text-[0.68rem] uppercase tracking-[0.28em] text-mute sm:inline">Guia digital · PDF</span>
      </header>

      {/* HERO */}
      <section id="conteudo" className="mx-auto grid max-w-6xl items-center gap-8 px-5 pb-20 pt-[max(2rem,env(safe-area-inset-top))] sm:gap-12 sm:px-8 sm:pt-16 lg:min-h-[calc(100svh-4rem)] lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 lg:pb-28">
        <div className="order-2 text-center lg:order-1 lg:text-left">
          <div className="animate-rise">
            <Eyebrow>{c.hero.eyebrow}</Eyebrow>
          </div>
          <h1 className="mx-auto mt-5 max-w-[17ch] font-serif text-[2.35rem] leading-[1.04] tracking-[-0.01em] text-paper animate-rise [animation-delay:80ms] sm:text-6xl lg:mx-0 lg:text-[4.1rem]">
            {c.hero.title}
          </h1>
          <p className="mx-auto mt-5 max-w-[34rem] text-[0.98rem] sm:text-[1.02rem] leading-relaxed text-paper/65 animate-rise [animation-delay:160ms] lg:mx-0">{c.hero.subtitle}</p>
          <div className="mt-8 flex flex-col items-center gap-4 animate-rise [animation-delay:240ms] lg:items-start">
            <a href="#oferta" className={goldButton}>
              {c.hero.cta}
              <ArrowDown className="h-4 w-4" strokeWidth={1.8} />
            </a>
            <p className="text-[0.75rem] tracking-[0.08em] text-mute">PDF digital · Pagamento único · {price}</p>
          </div>
        </div>
        <div className="order-1 mx-auto w-[min(36vw,150px)] animate-fade sm:w-[260px] lg:order-2 lg:w-[340px]">
          <Book3D coverUrl={coverUrl} />
        </div>
      </section>

      {/* SABER ONDE COMEÇAR */}
      {c.sections.orientacao && (
        <section className="relative border-t border-white/[0.05] px-5 py-24 sm:px-8 sm:py-36">
          <div className="mx-auto max-w-3xl text-center">
            <Reveal>
              <div className="mx-auto mb-10 h-14 w-px bg-gradient-to-b from-transparent via-gold/50 to-transparent" aria-hidden="true" />
              <h2 className="font-serif text-[2.2rem] leading-[1.08] text-paper sm:text-5xl">{c.orientacao.title}</h2>
            </Reveal>
            <Reveal delay={80} className="mx-auto mt-8 max-w-[38rem] space-y-5">
              <Paragraphs text={c.orientacao.body} className="text-[1.02rem] leading-[1.8] text-paper/65" />
            </Reveal>
          </div>
          <ol className={`mx-auto mt-20 grid max-w-5xl gap-12 sm:gap-10 ${c.orientacao.benefits.length >= 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
            {c.orientacao.benefits.map((b, i) => (
              <Reveal as="li" key={i} delay={i * 90} className="border-t border-gold/25 pt-6">
                <span className="font-serif text-sm italic text-gold/80">0{i + 1}</span>
                <h3 className="mt-3 font-serif text-[1.9rem] leading-none text-paper">{b.title}</h3>
                <p className="mt-4 text-[0.95rem] leading-relaxed text-paper/60">{b.text}</p>
              </Reveal>
            ))}
          </ol>
        </section>
      )}

      {/* O QUE RECEBES */}
      {c.sections.conteudo && (
        <section id="guia" className="px-5 py-24 sm:px-8 sm:py-32">
          <div className="mx-auto grid max-w-6xl items-center gap-16 lg:grid-cols-2">
            <Reveal className="relative mx-auto w-full max-w-md lg:max-w-none">
              {previewUrls.length ? (
                <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3 [scrollbar-width:none]">
                  {previewUrls.map((src, i) => (
                    // eslint-disable-next-line @next/next/no-img-element -- pré-visualizações carregadas pelo admin
                    <img key={src} src={src} alt={`Pré-visualização ${i + 1} do AUREA Guide`} loading="lazy" className="aspect-[3/4] w-[72%] shrink-0 snap-center rounded-[10px] border border-white/10 object-cover shadow-[0_30px_70px_-30px_rgba(0,0,0,0.95)] sm:w-[60%]" />
                  ))}
                </div>
              ) : (
                <div className="relative mx-auto aspect-[5/5] w-full max-w-[30rem]">
                  <IllustrativeSheet variant="plan" className="absolute left-[2%] top-[10%] w-[52%] -rotate-[7deg] opacity-70" />
                  <IllustrativeSheet variant="steps" className="absolute right-[2%] top-[4%] w-[52%] rotate-[6deg] opacity-85" />
                  <IllustrativeSheet variant="reveal" className="absolute left-1/2 top-[16%] w-[58%] -translate-x-1/2 shadow-[0_40px_90px_-30px_rgba(0,0,0,1),0_0_0_1px_rgba(214,180,106,0.15)]" />
                </div>
              )}
              {c.conteudo.note && <p className="mt-4 text-center text-xs text-mute">{c.conteudo.note}</p>}
            </Reveal>
            <div>
              <Reveal>
                <Eyebrow>O que recebes</Eyebrow>
                <h2 className="mt-5 font-serif text-[2.2rem] leading-[1.08] text-paper sm:text-5xl">{c.conteudo.title}</h2>
              </Reveal>
              <ul className="mt-10 divide-y divide-white/[0.06] border-y border-white/[0.06]">
                {c.conteudo.items.map((item, i) => (
                  <Reveal as="li" key={i} delay={i * 50} className="flex gap-5 py-4">
                    <span className="w-6 shrink-0 pt-0.5 text-right font-serif text-sm italic tabular-nums text-gold/80">{i + 1}</span>
                    <span className="text-[0.98rem] leading-relaxed text-paper/75">{item}</span>
                  </Reveal>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* A EXPERIÊNCIA DE DESCOBERTA */}
      {c.sections.experiencia && (
        <section className="relative overflow-hidden px-5 py-24 sm:px-8 sm:py-32">
          <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[40rem] w-[40rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(214,180,106,0.07),transparent)]" />
          <div className="mx-auto grid max-w-6xl items-center gap-16 lg:grid-cols-[1fr_1fr]">
            <div className="lg:order-2">
              <Reveal>
                <h2 className="font-serif text-[2.2rem] leading-[1.08] text-paper sm:text-5xl">{c.experiencia.title}</h2>
              </Reveal>
              <Reveal delay={80} className="mt-8 max-w-[34rem] space-y-5">
                <Paragraphs text={c.experiencia.body} className="text-[1.02rem] leading-[1.8] text-paper/65" />
              </Reveal>
              <Reveal delay={140} className="mt-8 flex flex-wrap gap-2">
                {["Documento PDF", "Telemóvel ou computador", "Consulta ao teu ritmo"].map((t) => (
                  <span key={t} className="rounded-full border border-white/10 px-3.5 py-1.5 text-xs text-paper/60">{t}</span>
                ))}
              </Reveal>
            </div>
            <Reveal className="relative mx-auto h-[26rem] w-full max-w-[24rem] sm:h-[30rem] lg:order-1">
              <IllustrativeSheet variant="steps" className="glass absolute right-0 top-[8%] w-[62%] rotate-[5deg] opacity-80" />
              <PhoneMockup coverUrl={coverUrl} className="absolute bottom-0 left-[4%] w-[52%]" />
            </Reveal>
          </div>
        </section>
      )}

      {/* OFERTA */}
      <section id="oferta" className="scroll-mt-6 px-5 py-24 sm:px-8 sm:py-32">
        <Reveal className="mx-auto max-w-4xl">
          <div className="text-center">
            <h2 className="font-serif text-[2.4rem] leading-[1.05] text-paper sm:text-6xl">{c.oferta.title}</h2>
          </div>
          <div className="glass-strong glass-sheen mt-12 overflow-hidden rounded-[1.75rem] p-6 sm:p-10">
            <div className="grid items-center gap-10 sm:grid-cols-[0.75fr_1.25fr]">
              <div className="mx-auto w-[min(48vw,200px)] sm:w-full sm:max-w-[220px]">
                <Book3D coverUrl={coverUrl} />
              </div>
              <div className="text-center sm:text-left">
                <span className="inline-flex rounded-full border border-gold/35 bg-gold/[0.07] px-3 py-1 text-[0.64rem] font-medium uppercase tracking-[0.26em] text-gold-light">{c.oferta.label}</span>
                <p className="mt-5 text-[0.8rem] font-medium uppercase tracking-[0.36em] text-paper/85">{c.oferta.productName}</p>
                <p className="mt-3 text-[0.98rem] leading-relaxed text-paper/65">{c.oferta.description}</p>
                <p className="mt-7 font-serif text-[3.4rem] leading-none text-gold-gradient tabular-nums sm:text-6xl">{price}</p>
                <div className="mt-8">
                  {buyHref ? (
                    <a href={buyHref} rel="nofollow noopener" className={`${goldButton} w-full sm:w-auto`}>
                      {c.oferta.cta}
                    </a>
                  ) : (
                    <span className={`${goldButton} w-full cursor-not-allowed opacity-80 sm:w-auto`} title="Na pré-visualização o botão não abre o checkout">
                      {c.oferta.cta}
                    </span>
                  )}
                </div>
                <p className="mt-5 text-[0.78rem] leading-relaxed text-mute">{c.oferta.microtext}</p>
                <p className="mt-3 flex items-start justify-center gap-2 text-[0.78rem] leading-relaxed text-paper/55 sm:justify-start">
                  <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold/80" strokeWidth={1.8} />
                  <span>{c.oferta.checkoutNotice}</span>
                </p>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* PERGUNTAS FREQUENTES */}
      {c.sections.faq && c.faq.length > 0 && (
        <section className="px-5 pb-24 pt-8 sm:px-8 sm:pb-32">
          <div className="mx-auto max-w-2xl">
            <Reveal>
              <Eyebrow>Perguntas frequentes</Eyebrow>
            </Reveal>
            <div className="mt-8 divide-y divide-white/[0.07] border-y border-white/[0.07]">
              {c.faq.map((f, i) => (
                <details key={i} className="group [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-6 py-5 text-left text-[1rem] text-paper/90 hover:text-paper">
                    {f.q}
                    <Plus className="h-4 w-4 shrink-0 text-gold transition-transform duration-300 group-open:rotate-45" strokeWidth={1.6} />
                  </summary>
                  <p className="-mt-1 pb-6 pr-10 text-[0.95rem] leading-relaxed text-paper/60">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      )}

      <footer className="border-t border-white/[0.05] px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-10 text-center sm:px-8">
        <p className="inline-flex items-center gap-2 text-[0.7rem] uppercase tracking-[0.3em] text-paper/60">
          <FileText className="h-3.5 w-3.5 text-gold/80" strokeWidth={1.6} /> Aurea Guide
        </p>
        <p className="mx-auto mt-3 max-w-md text-xs leading-relaxed text-mute">
          Produto digital informativo. Não substitui diagnóstico, aconselhamento ou tratamento médico. © {new Date().getFullYear()}
        </p>
      </footer>
    </div>
  );
}
