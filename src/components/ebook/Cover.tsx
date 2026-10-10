import { useId } from "react";

/**
 * Capa própria do AUREA Guide: composição geométrica abstrata, ondas sonoras
 * discretas e detalhes dourados. Não contém o nome nem o endereço da plataforma revelada no guia.
 */
export function CoverArt({ className = "" }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 300 420" className={className} role="img" aria-label="Capa do AUREA Guide" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#141416" />
          <stop offset="0.55" stopColor="#0B0B0D" />
          <stop offset="1" stopColor="#050505" />
        </linearGradient>
        <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F0DCA5" />
          <stop offset="0.55" stopColor="#D6B46A" />
          <stop offset="1" stopColor="#A8873F" />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="0.5" cy="0.42" r="0.5">
          <stop offset="0" stopColor="#D6B46A" stopOpacity="0.22" />
          <stop offset="1" stopColor="#D6B46A" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="300" height="420" fill={`url(#${id}-bg)`} />
      <rect width="300" height="420" fill={`url(#${id}-glow)`} />
      {/* Anéis concêntricos */}
      <g fill="none" stroke={`url(#${id}-gold)`}>
        <circle cx="150" cy="176" r="96" strokeWidth="0.6" opacity="0.35" />
        <circle cx="150" cy="176" r="74" strokeWidth="0.8" opacity="0.55" />
        <circle cx="150" cy="176" r="52" strokeWidth="1" opacity="0.8" />
        <circle cx="150" cy="176" r="118" strokeWidth="0.5" opacity="0.18" strokeDasharray="1 5" />
      </g>
      {/* Ondas */}
      <g fill="none" strokeLinecap="round">
        <path d="M18 176c22-34 44-34 66 0s44 34 66 0 44-34 66 0 44 34 66 0" stroke={`url(#${id}-gold)`} strokeWidth="1.6" />
        <path d="M18 176c22-20 44-20 66 0s44 20 66 0 44-20 66 0 44 20 66 0" stroke="#F0DCA5" strokeWidth="0.6" opacity="0.4" />
        <path d="M18 176c22-48 44-48 66 0s44 48 66 0 44-48 66 0 44 48 66 0" stroke="#D6B46A" strokeWidth="0.5" opacity="0.22" />
      </g>
      <circle cx="150" cy="176" r="2.4" fill="#F0DCA5" />
      {/* Moldura fina */}
      <rect x="14" y="14" width="272" height="392" fill="none" stroke="#D6B46A" strokeOpacity="0.28" strokeWidth="0.6" />
      <text x="150" y="44" textAnchor="middle" fill="#D6B46A" fontSize="7.5" letterSpacing="3.2" style={{ fontFamily: "var(--font-geist), ui-sans-serif, system-ui, sans-serif" }}>GUIA DIGITAL</text>
      <text x="150" y="328" textAnchor="middle" fill={`url(#${id}-gold)`} fontSize="38" letterSpacing="9" style={{ fontFamily: "var(--font-editorial), 'Times New Roman', serif" }}>AUREA</text>
      <line x1="112" y1="344" x2="188" y2="344" stroke="#D6B46A" strokeOpacity="0.5" strokeWidth="0.6" />
      <text x="150" y="364" textAnchor="middle" fill="#F5F3EE" fillOpacity="0.85" fontSize="10.5" letterSpacing="7" style={{ fontFamily: "var(--font-geist), ui-sans-serif, system-ui, sans-serif" }}>GUIDE</text>
      <text x="150" y="394" textAnchor="middle" fill="#969696" fontSize="6.5" letterSpacing="2.4" style={{ fontFamily: "var(--font-geist), ui-sans-serif, system-ui, sans-serif" }}>DESCOBRIR · COMPREENDER · EXPLORAR</text>
    </svg>
  );
}

/** Livro tridimensional com a capa (gerada ou carregada pelo admin), lombada e reflexo. */
export function Book3D({ coverUrl, className = "", tilt = true }: { coverUrl?: string | null; className?: string; tilt?: boolean }) {
  return (
    <div className={`relative [perspective:1600px] ${className}`}>
      <div aria-hidden="true" className="absolute -inset-10 rounded-full bg-[radial-gradient(closest-side,rgba(214,180,106,0.22),transparent)] blur-2xl" />
      <div
        className={`relative mx-auto aspect-[300/420] w-full [transform-style:preserve-3d] transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          tilt ? "[transform:rotateY(-20deg)_rotateX(4deg)] hover:[transform:rotateY(-12deg)_rotateX(2deg)]" : ""
        }`}
      >
        {/* Lombada */}
        <div aria-hidden="true" className="absolute inset-y-[0.6%] left-0 w-[7%] origin-left bg-gradient-to-r from-[#3a2f17] via-[#1a160d] to-[#0b0b0d] [transform:rotateY(90deg)_translateX(-100%)]" />
        {/* Páginas */}
        <div aria-hidden="true" className="absolute inset-y-[1.2%] right-0 w-[5%] origin-right bg-[repeating-linear-gradient(90deg,#e9e4d8_0_1px,#cfc8b8_1px_2px)] [transform:rotateY(-90deg)_translateX(100%)]" />
        <div className="absolute inset-0 overflow-hidden rounded-r-[6px] rounded-l-[2px] shadow-[0_40px_80px_-30px_rgba(0,0,0,0.95),0_0_0_1px_rgba(214,180,106,0.18)]">
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- imagem carregada pelo admin no Storage
            <img src={coverUrl} alt="Capa do AUREA Guide" className="h-full w-full object-cover" />
          ) : (
            <CoverArt className="h-full w-full" />
          )}
          {/* Reflexo e dobra da lombada */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(105deg,rgba(255,255,255,0.10)_0%,transparent_28%,transparent_70%,rgba(255,255,255,0.04)_100%)]" />
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-[3.5%] w-px bg-white/10" />
        </div>
      </div>
      {/* Reflexo no chão */}
      <div aria-hidden="true" className="mx-auto mt-[8%] h-[4%] w-3/4 rounded-[50%] bg-black/70 blur-xl" />
    </div>
  );
}
