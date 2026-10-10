import { CoverArt } from "./Cover";

/** Linhas de texto genéricas (não são páginas reais do guia). */
function Lines({ n = 5, widths = ["100%", "92%", "96%", "84%", "60%"] }: { n?: number; widths?: string[] }) {
  return (
    <div className="space-y-[0.45em]" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="h-[0.32em] rounded-full bg-paper/[0.13]" style={{ width: widths[i % widths.length] }} />
      ))}
    </div>
  );
}

/** Folha ilustrativa genérica do documento. */
export function IllustrativeSheet({ variant, className = "" }: { variant: "reveal" | "steps" | "plan"; className?: string }) {
  return (
    <div className={`aspect-[3/4] rounded-[10px] border border-white/[0.09] bg-[linear-gradient(180deg,#141416,#0b0b0d)] p-[9%] text-[clamp(10px,2.4vw,15px)] shadow-[0_30px_70px_-30px_rgba(0,0,0,0.95)] ${className}`} aria-hidden="true">
      <div className="flex items-center justify-between">
        <span className="text-[0.55em] uppercase tracking-[0.3em] text-gold/80">AUREA Guide</span>
        <span className="text-[0.55em] tabular-nums text-mute">{variant === "reveal" ? "01" : variant === "steps" ? "02" : "07"}</span>
      </div>
      <div className="mt-[1em] h-px bg-gradient-to-r from-gold/50 via-gold/15 to-transparent" />
      {variant === "reveal" && (
        <div className="mt-[1.4em]">
          <p className="text-[0.62em] uppercase tracking-[0.22em] text-mute">A plataforma</p>
          <div className="relative mt-[0.8em] overflow-hidden rounded-md border border-gold/25 bg-gold/[0.04] px-[0.8em] py-[0.9em]">
            <div className="h-[0.75em] w-3/4 rounded-sm bg-paper/30 blur-[5px]" />
            <div className="mt-[0.5em] h-[0.45em] w-1/2 rounded-sm bg-gold/40 blur-[4px]" />
            <span className="absolute right-[0.6em] top-1/2 -translate-y-1/2 rounded-full border border-gold/30 bg-ink/80 px-[0.6em] py-[0.15em] text-[0.48em] uppercase tracking-[0.18em] text-gold-light">revelado no guia</span>
          </div>
          <div className="mt-[1.4em]"><Lines /></div>
          <div className="mt-[1em]"><Lines n={3} widths={["94%", "88%", "40%"]} /></div>
        </div>
      )}
      {variant === "steps" && (
        <div className="mt-[1.4em] space-y-[1em]">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-[0.8em]">
              <span className="grid h-[1.6em] w-[1.6em] shrink-0 place-items-center rounded-full border border-gold/40 text-[0.6em] text-gold-light">{i}</span>
              <div className="flex-1 pt-[0.3em]"><Lines n={2} widths={["90%", "62%"]} /></div>
            </div>
          ))}
          <div className="rounded-md border border-white/[0.07] bg-white/[0.02] p-[0.8em]"><Lines n={3} widths={["80%", "95%", "50%"]} /></div>
        </div>
      )}
      {variant === "plan" && (
        <div className="mt-[1.4em]">
          <p className="text-[0.62em] uppercase tracking-[0.22em] text-mute">Sete dias</p>
          <div className="mt-[0.8em] grid grid-cols-7 gap-[0.3em]">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className={`aspect-square rounded-[4px] border ${i < 3 ? "border-gold/40 bg-gold/[0.12]" : "border-white/[0.08]"}`} />
            ))}
          </div>
          <div className="mt-[1.2em]"><Lines n={4} /></div>
          <svg viewBox="0 0 200 30" className="mt-[1em] w-full" fill="none">
            <path d="M0 15c12-11 24-11 36 0s24 11 36 0 24-11 36 0 24 11 36 0 24-11 36 0 18 8 20 6" stroke="#D6B46A" strokeOpacity="0.45" strokeWidth="1" />
          </svg>
        </div>
      )}
    </div>
  );
}

/** Telemóvel minimalista com o guia aberto (ilustrativo). */
export function PhoneMockup({ coverUrl, className = "" }: { coverUrl?: string | null; className?: string }) {
  return (
    <div className={`relative aspect-[9/19] rounded-[2.6rem] border border-white/[0.14] bg-[#0d0d0f] p-[3.2%] shadow-[0_50px_100px_-40px_rgba(0,0,0,1),inset_0_0_0_1px_rgba(255,255,255,0.04)] ${className}`} aria-hidden="true">
      <div className="relative h-full overflow-hidden rounded-[2.2rem] bg-ink">
        <div className="absolute left-1/2 top-[1.6%] z-10 h-[3.2%] w-[32%] -translate-x-1/2 rounded-full bg-black" />
        <div className="flex h-full flex-col px-[7%] pb-[6%] pt-[14%] text-[clamp(9px,2.2vw,13px)]">
          <div className="flex items-center justify-between text-[0.7em] text-mute">
            <span>AUREA-Guide.pdf</span>
            <span className="tabular-nums">1 / 24</span>
          </div>
          <div className="mt-[6%] overflow-hidden rounded-md border border-gold/20">
            {coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- imagem carregada pelo admin
              <img src={coverUrl} alt="" className="aspect-[300/420] w-full object-cover" />
            ) : (
              <CoverArt className="aspect-[300/420] w-full" />
            )}
          </div>
          <div className="mt-[8%] space-y-[0.5em]">
            {["100%", "86%", "94%", "70%"].map((w, i) => (
              <div key={i} className="h-[0.32em] rounded-full bg-paper/[0.12]" style={{ width: w }} />
            ))}
          </div>
          <div className="mt-auto flex justify-center gap-[0.4em]">
            {[0, 1, 2].map((i) => (
              <span key={i} className={`h-[0.35em] rounded-full ${i === 0 ? "w-[1.4em] bg-gold/70" : "w-[0.35em] bg-white/20"}`} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
