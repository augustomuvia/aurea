"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import {
  ChevronDown,
  Headphones,
  Heart,
  ListMusic,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
  X,
  AlertCircle,
} from "lucide-react";
import { usePlayer } from "./PlayerProvider";
import { PlayerWave, PlayingBars } from "@/components/brand/Waves";
import { Spinner } from "@/components/ui/Spinner";
import { formatDuration } from "@/lib/format";

function IconButton({
  label,
  onClick,
  children,
  className = "",
  active = false,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active || undefined}
      className={`press grid h-10 w-10 place-items-center rounded-full text-paper/75 hover:bg-white/[0.07] hover:text-paper disabled:opacity-30 ${active ? "text-gold" : ""} ${className}`}
    >
      {children}
    </button>
  );
}

function PlayButton({ size = "md" }: { size?: "md" | "lg" }) {
  const { status, toggle } = usePlayer();
  const playing = status === "playing";
  const loading = status === "loading";
  const dims = size === "lg" ? "h-16 w-16" : "h-11 w-11";
  const icon = size === "lg" ? "h-6 w-6" : "h-4.5 w-4.5";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={playing || loading ? "Pausar" : "Reproduzir"}
      className={`press grid ${dims} shrink-0 place-items-center rounded-full bg-gradient-to-b from-gold-light to-gold text-ink shadow-[0_10px_40px_-12px_rgba(214,180,106,0.7),inset_0_1px_0_rgba(255,255,255,0.5)]`}
    >
      {loading ? <Spinner className={icon} /> : playing ? <Pause className={`${icon} fill-current`} /> : <Play className={`${icon} translate-x-[1px] fill-current`} />}
    </button>
  );
}

function Progress({ compact = false }: { compact?: boolean }) {
  const { currentTime, duration, seek } = usePlayer();
  const pct = duration ? Math.min(100, (currentTime / duration) * 100) : 0;
  if (compact) {
    return (
      <div className="h-[2px] w-full overflow-hidden rounded-full bg-white/10" aria-hidden="true">
        <div className="h-full bg-gold transition-[width] duration-500 ease-linear" style={{ width: `${pct}%` }} />
      </div>
    );
  }
  return (
    <div>
      <input
        type="range"
        className="aurea-range w-full"
        min={0}
        max={Math.max(1, Math.floor(duration))}
        step={1}
        value={Math.floor(currentTime)}
        onChange={(e) => seek(Number(e.target.value))}
        aria-label="Posição da reprodução"
        aria-valuetext={`${formatDuration(currentTime) || "0:00"} de ${formatDuration(duration) || "duração desconhecida"}`}
        disabled={!duration}
        style={{ ["--fill" as string]: `${pct}%` }}
      />
      <div className="mt-1 flex justify-between text-[0.72rem] tabular-nums text-mute">
        <span>{formatDuration(currentTime) || "0:00"}</span>
        <span>{duration ? formatDuration(duration) : "—"}</span>
      </div>
    </div>
  );
}

function VolumeControl() {
  const { volume, muted, setVolume, toggleMute } = usePlayer();
  const Icon = muted || volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;
  return (
    <div className="flex items-center gap-2">
      <IconButton label={muted ? "Ativar som" : "Silenciar"} onClick={toggleMute}>
        <Icon className="h-4.5 w-4.5" />
      </IconButton>
      <input
        type="range"
        min={0}
        max={100}
        value={muted ? 0 : volume}
        onChange={(e) => setVolume(Number(e.target.value))}
        className="aurea-range w-28"
        aria-label="Volume"
        style={{ ["--fill" as string]: `${muted ? 0 : volume}%` }}
      />
    </div>
  );
}

export function PlayerShell() {
  const p = usePlayer();
  const { current, mode, status, error, hostRef, needsTap } = p;
  const expanded = mode === "expanded" && current;
  const collapsed = mode === "collapsed" && current;
  const isFav = current ? p.favorites.has(current.contentId) : false;
  const dialogRef = useRef<HTMLDivElement>(null);

  // Escape fecha o player expandido; foco movido para o diálogo.
  useEffect(() => {
    if (!expanded) return;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") p.setMode("mini");
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [expanded, p]);

  const shellClass = !current
    ? "fixed bottom-0 right-0 z-40 w-[320px] pointer-events-none opacity-0 translate-y-8"
    : expanded
      ? "fixed inset-0 z-50 overflow-y-auto bg-ink/[0.97] backdrop-blur-2xl animate-fade"
      : "fixed z-40 left-3 right-3 bottom-[calc(76px+env(safe-area-inset-bottom))] md:bottom-6 md:left-auto md:right-6 md:w-[384px] glass-strong rounded-[1.6rem] p-2.5 animate-rise";

  const videoClass = !current
    ? "h-[200px] w-[320px]"
    : expanded
      ? "w-full aspect-video min-h-[200px] rounded-[1.4rem] border border-white/10"
      : collapsed
        ? "h-0 w-full"
        : "h-[200px] w-full rounded-[1.1rem]";

  return (
    <div
      className={`transition-[opacity,transform] duration-500 ${shellClass}`}
      role={expanded ? "dialog" : "region"}
      aria-modal={expanded ? true : undefined}
      aria-label="Leitor AUREA"
      aria-hidden={!current || undefined}
      ref={dialogRef}
      tabIndex={expanded ? -1 : undefined}
    >
      <div className={expanded ? "mx-auto flex min-h-full max-w-6xl flex-col px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8" : ""}>
        {expanded && (
          <div className="flex items-center justify-between py-3">
            <IconButton label="Minimizar leitor" onClick={() => p.setMode("mini")}>
              <ChevronDown className="h-5 w-5" />
            </IconButton>
            <p className="text-[0.72rem] uppercase tracking-[0.24em] text-mute">A reproduzir</p>
            <IconButton label="Fechar leitor" onClick={p.close}>
              <X className="h-5 w-5" />
            </IconButton>
          </div>
        )}

        <div className={expanded ? "grid flex-1 items-center gap-8 py-4 lg:grid-cols-[1.25fr_1fr] lg:gap-14" : ""}>
          {/* O iframe do YouTube fica sempre neste nó: nunca é desmontado durante a navegação. */}
          <div className={expanded ? "relative" : ""}>
            <div className={`relative overflow-hidden bg-black transition-[height] duration-500 ${videoClass}`}>
              <div ref={hostRef} className="absolute inset-0 [&>iframe]:h-full [&>iframe]:w-full" />
              {current && needsTap && status !== "playing" && status !== "error" && !collapsed && (
                <p
                  role="status"
                  className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-ink/90 to-transparent px-4 pb-6 pt-3 text-center text-xs text-paper/90"
                >
                  Toque no vídeo para iniciar a reprodução.
                </p>
              )}
              {current && status === "error" && (
                <div className="absolute inset-0 grid place-items-center bg-ink/90 p-6 text-center" role="alert">
                  <div>
                    <AlertCircle className="mx-auto mb-3 h-6 w-6 text-danger" />
                    <p className="text-sm text-paper/85">{error}</p>
                    <div className="mt-4 flex items-center justify-center gap-5">
                      <button onClick={p.retry} className="press text-sm text-gold-light underline underline-offset-4">
                        Tentar novamente
                      </button>
                      {p.index < p.queue.length - 1 && (
                        <button onClick={p.next} className="press text-sm text-paper/70 underline underline-offset-4">
                          Passar ao seguinte
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
            {expanded && (
              <p className="mt-3 text-[0.72rem] leading-relaxed text-mute">
                Reprodução através do leitor oficial do YouTube. Publicidade, marcas e avisos do YouTube podem ser apresentados.
              </p>
            )}
          </div>

          {current && expanded && (
            <div className="animate-rise">
              <p className="text-[0.72rem] uppercase tracking-[0.22em] text-gold/90">{current.category ?? "Experiência sonora"}</p>
              <h2 className="mt-3 font-serif text-4xl leading-[1.05] text-paper sm:text-5xl">{current.title}</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {current.frequencyHz && (
                  <span className="rounded-full border border-gold/30 px-3 py-1 text-xs text-gold-light">{Number(current.frequencyHz)} Hz · frequência declarada</span>
                )}
                {current.isBinaural && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1 text-xs text-paper/70">
                    <Headphones className="h-3.5 w-3.5" /> Binaural · use auscultadores
                  </span>
                )}
              </div>
              <div className="mt-8">
                <PlayerWave playing={status === "playing"} />
              </div>
              <div className="mt-4">
                <Progress />
              </div>
              <div className="mt-5 flex items-center justify-center gap-2 sm:gap-4">
                <IconButton label="Recuar 15 segundos" onClick={() => p.skip(-15)}>
                  <RotateCcw className="h-4.5 w-4.5" />
                </IconButton>
                <IconButton label="Anterior" onClick={p.previous}>
                  <SkipBack className="h-5 w-5 fill-current" />
                </IconButton>
                <PlayButton size="lg" />
                <IconButton label="Seguinte" onClick={p.next} disabled={p.index >= p.queue.length - 1}>
                  <SkipForward className="h-5 w-5 fill-current" />
                </IconButton>
                <IconButton label="Avançar 15 segundos" onClick={() => p.skip(15)}>
                  <RotateCw className="h-4.5 w-4.5" />
                </IconButton>
              </div>
              <div className="mt-6 flex items-center justify-between">
                <VolumeControl />
                <IconButton label={isFav ? "Remover dos favoritos" : "Adicionar aos favoritos"} onClick={() => void p.toggleFav(current.contentId)} active={isFav}>
                  <Heart className={`h-5 w-5 ${isFav ? "fill-gold text-gold" : ""}`} />
                </IconButton>
              </div>

              {p.queue.length > 1 && (
                <div className="mt-8">
                  <p className="mb-3 flex items-center gap-2 text-[0.72rem] uppercase tracking-[0.2em] text-mute">
                    <ListMusic className="h-3.5 w-3.5" /> Fila de reprodução
                  </p>
                  <ol className="glass max-h-64 divide-y divide-white/[0.06] overflow-y-auto">
                    {p.queue.map((t, i) => (
                      <li key={`${t.contentId}-${i}`}>
                        <button
                          type="button"
                          onClick={() => p.jumpTo(i)}
                          aria-current={i === p.index ? "true" : undefined}
                          className="press flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.04]"
                        >
                          <span className="w-5 text-xs tabular-nums text-mute">{i === p.index ? <PlayingBars playing={status === "playing"} /> : i + 1}</span>
                          <span className={`flex-1 truncate text-sm ${i === p.index ? "text-gold-light" : "text-paper/80"}`}>{t.title}</span>
                          {t.durationSeconds ? <span className="text-xs tabular-nums text-mute">{formatDuration(t.durationSeconds)}</span> : null}
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              <p className="mt-6 text-[0.72rem] text-mute">
                <Link href={`/app/conteudo/${current.slug}`} onClick={() => p.setMode("mini")} className="underline underline-offset-4 hover:text-paper">
                  Ver detalhes do conteúdo
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>

      {current && !expanded && (
        <div className={collapsed ? "" : "mt-2.5"}>
          <div className="flex items-center gap-2 pl-2">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 truncate text-sm font-medium text-paper">
                <PlayingBars playing={status === "playing"} className="h-3 w-3.5 shrink-0" />
                <span className="truncate">{current.title}</span>
              </p>
              <p className="truncate text-xs text-mute">
                {collapsed ? "Em pausa · o vídeo tem de estar visível para reproduzir" : [current.category, current.frequencyHz ? `${Number(current.frequencyHz)} Hz` : null].filter(Boolean).join(" · ")}
              </p>
            </div>
            {collapsed ? (
              <button
                type="button"
                onClick={() => {
                  p.setMode("mini");
                  p.toggle();
                }}
                aria-label="Retomar reprodução"
                className="press grid h-10 w-10 place-items-center rounded-full bg-gold text-ink"
              >
                <Play className="h-4 w-4 translate-x-[1px] fill-current" />
              </button>
            ) : (
              <>
                <IconButton label="Anterior" onClick={p.previous} className="hidden sm:grid">
                  <SkipBack className="h-4 w-4 fill-current" />
                </IconButton>
                <PlayButton />
                <IconButton label="Seguinte" onClick={p.next} disabled={p.index >= p.queue.length - 1}>
                  <SkipForward className="h-4 w-4 fill-current" />
                </IconButton>
              </>
            )}
            <div className="flex flex-col">
              <IconButton label="Expandir leitor" onClick={() => p.setMode("expanded")} className="h-8 w-8">
                <Maximize2 className="h-3.5 w-3.5" />
              </IconButton>
              {collapsed ? (
                <IconButton label="Fechar leitor" onClick={p.close} className="h-8 w-8">
                  <X className="h-3.5 w-3.5" />
                </IconButton>
              ) : (
                <IconButton label="Recolher leitor (pausa a reprodução)" onClick={() => p.setMode("collapsed")} className="h-8 w-8">
                  <Minimize2 className="h-3.5 w-3.5" />
                </IconButton>
              )}
            </div>
          </div>
          {!collapsed && (
            <div className="mt-2 px-2 pb-1">
              <Progress compact />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
