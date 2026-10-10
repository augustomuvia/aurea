"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Pause, Play, SkipBack, SkipForward, Trash2, WifiOff } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { formatDurationLong } from "@/lib/format";
import {
  formatMb,
  isExpired,
  listOffline,
  OFFLINE_EVENT,
  offlineCover,
  offlineObjectUrl,
  offlineSupported,
  purgeExpired,
  removeOffline,
  type OfflineTrack,
} from "@/lib/offline";

/** 0,1 s de silêncio em WAV: desbloqueia o <audio> no iPhone dentro do toque, antes de ler o ficheiro do cache. */
function silentWavUrl() {
  const samples = 4410;
  const buf = new ArrayBuffer(44 + samples * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + samples * 2, true);
  str(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 44100, true);
  v.setUint32(28, 88200, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, samples * 2, true);
  return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function OfflineLibrary() {
  const [items, setItems] = useState<OfflineTrack[]>([]);
  const [ready, setReady] = useState(false);
  const [supported, setSupported] = useState(true);
  const [online, setOnline] = useState(true);
  const [current, setCurrent] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const silentRef = useRef<string | null>(null);
  const playIdRef = useRef(0);
  const itemsRef = useRef<OfflineTrack[]>([]);
  const nextRef = useRef<(dir: 1 | -1) => void>(() => undefined);

  const load = useCallback(() => {
    const list = listOffline();
    itemsRef.current = list.filter((t) => !isExpired(t));
    setItems(list);
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    setSupported(offlineSupported());
    setOnline(navigator.onLine);
    load();
    setReady(true);
    const on = () => setOnline(navigator.onLine);
    window.addEventListener(OFFLINE_EVENT, load);
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => {
      window.removeEventListener(OFFLINE_EVENT, load);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, [load]);

  const getAudio = useCallback(() => {
    if (audioRef.current) return audioRef.current;
    const a = new Audio();
    a.preload = "auto";
    a.addEventListener("playing", () => setPlaying(true));
    a.addEventListener("pause", () => setPlaying(false));
    a.addEventListener("timeupdate", () => {
      setPos(a.currentTime);
      if ("mediaSession" in navigator && a.duration && Number.isFinite(a.duration)) {
        try {
          navigator.mediaSession.setPositionState({ duration: a.duration, position: Math.min(a.currentTime, a.duration), playbackRate: 1 });
        } catch {
          /* nada */
        }
      }
    });
    a.addEventListener("loadedmetadata", () => setDur(Number.isFinite(a.duration) ? a.duration : 0));
    a.addEventListener("ended", () => {
      if (a.src !== silentRef.current) nextRef.current(1);
    });
    audioRef.current = a;
    return a;
  }, []);

  const start = useCallback(
    (t: OfflineTrack) => {
      const a = getAudio();
      const id = ++playIdRef.current;
      setError(null);
      setCurrent(t.contentId);
      setPos(0);
      setDur(t.durationSeconds ?? 0);
      // Ainda dentro do toque: desbloqueia o elemento com silêncio.
      silentRef.current ??= silentWavUrl();
      if (!a.src || a.paused) {
        a.src = silentRef.current;
        void a.play().catch(() => undefined);
      }
      void offlineObjectUrl(t.contentId).then((url) => {
        if (id !== playIdRef.current) {
          if (url) URL.revokeObjectURL(url);
          return;
        }
        if (!url) {
          setError("Este download já não está disponível. Volte a descarregar com rede.");
          void purgeExpired();
          return;
        }
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = url;
        a.src = url;
        void a.play().catch(() => setError("Toque em reproduzir para continuar."));
        if ("mediaSession" in navigator) {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: t.title,
            artist: "AUREA",
            album: t.category ?? "Offline",
            artwork: [
              { src: offlineCover(t), sizes: "1280x720", type: "image/jpeg" },
              { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
            ],
          });
        }
      });
    },
    [getAudio],
  );

  nextRef.current = (dir) => {
    const list = itemsRef.current;
    if (!list.length) return;
    const i = list.findIndex((t) => t.contentId === current);
    const next = list[(i + dir + list.length) % list.length];
    if (next) start(next);
  };

  const toggle = (t?: OfflineTrack) => {
    const a = getAudio();
    if (t && t.contentId !== current) return start(t);
    if (!current) {
      const first = itemsRef.current[0];
      if (first) start(first);
      return;
    }
    if (a.paused) void a.play().catch(() => undefined);
    else a.pause();
  };

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    const a = () => audioRef.current;
    ms.setActionHandler("play", () => void a()?.play());
    ms.setActionHandler("pause", () => a()?.pause());
    ms.setActionHandler("nexttrack", () => nextRef.current(1));
    ms.setActionHandler("previoustrack", () => nextRef.current(-1));
    ms.setActionHandler("seekto", (d) => {
      const el = a();
      if (el && d.seekTime !== undefined) el.currentTime = d.seekTime;
    });
    return () => {
      for (const k of ["play", "pause", "nexttrack", "previoustrack", "seekto"] as MediaSessionAction[]) ms.setActionHandler(k, null);
    };
  }, []);

  useEffect(
    () => () => {
      audioRef.current?.pause();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  async function remove(t: OfflineTrack) {
    if (t.contentId === current) {
      audioRef.current?.pause();
      setCurrent(null);
    }
    await removeOffline(t.contentId);
  }

  const valid = items.filter((t) => !isExpired(t));
  const expired = items.filter(isExpired);
  const total = valid.reduce((s, t) => s + t.bytes, 0);
  const now = valid.find((t) => t.contentId === current) ?? null;

  return (
    <div className="mx-auto min-h-dvh max-w-3xl px-4 pb-48 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-6">
      <header className="flex items-center justify-between py-3">
        <a href="/app" aria-label="AUREA — voltar à app" className="press">
          <Logo size="sm" />
        </a>
        {online ? (
          <a href="/app" className="press glass rounded-full px-4 py-2 text-sm text-paper/80 hover:text-paper">Voltar à app</a>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs text-paper/70">
            <WifiOff className="h-3.5 w-3.5" /> Sem rede
          </span>
        )}
      </header>

      <h1 className="mt-6 font-serif text-4xl text-paper sm:text-5xl">Downloads offline</h1>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-paper/65">
        Sons AUREA guardados neste telemóvel. Tocam sem rede e com o ecrã bloqueado enquanto a sua assinatura Trimestral ou Anual estiver ativa.
      </p>

      {!supported && <p className="mt-8 text-sm text-danger">Este navegador não permite guardar áudio. Experimente o Safari ou o Chrome.</p>}

      {ready && supported && valid.length === 0 && (
        <div className="glass mt-8 flex items-start gap-3 p-5 text-sm text-paper/75">
          <Download className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
          <p>
            Ainda não tem downloads. Com rede, abra um som AUREA e toque em <strong className="text-paper">Descarregar</strong>.
          </p>
        </div>
      )}

      {valid.length > 0 && (
        <>
          <p className="mt-8 text-xs text-mute">
            {valid.length} {valid.length === 1 ? "som" : "sons"} · {formatMb(total)} · disponível até{" "}
            {new Date(valid[0].until).toLocaleDateString("pt-PT")}
          </p>
          <ul className="mt-3 divide-y divide-white/[0.06]">
            {valid.map((t) => {
              const on = t.contentId === current;
              return (
                <li key={t.contentId} className="flex items-center gap-3 py-3">
                  <button
                    type="button"
                    onClick={() => toggle(t)}
                    className="press relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-white/[0.08]"
                    aria-label={on && playing ? `Pausar ${t.title}` : `Ouvir ${t.title}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={offlineCover(t)} alt="" className="h-full w-full object-cover opacity-80" />
                    <span className="absolute inset-0 grid place-items-center bg-ink/35">
                      {on && playing ? <Pause className="h-5 w-5 text-paper" /> : <Play className="h-5 w-5 text-paper" />}
                    </span>
                  </button>
                  <button type="button" onClick={() => toggle(t)} className="min-w-0 flex-1 text-left">
                    <p className={`truncate text-[0.95rem] ${on ? "text-gold-light" : "text-paper"}`}>{t.title}</p>
                    <p className="truncate text-xs text-mute">
                      {[t.category, t.durationSeconds ? formatDurationLong(t.durationSeconds) : null, formatMb(t.bytes)].filter(Boolean).join(" · ")}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(t)}
                    className="press grid h-10 w-10 place-items-center rounded-full text-mute hover:bg-white/[0.06] hover:text-paper"
                    aria-label={`Apagar ${t.title} deste telemóvel`}
                    title="Apagar deste telemóvel"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {expired.length > 0 && (
        <div className="glass mt-8 p-5 text-sm text-paper/75">
          <p>
            {expired.length === 1 ? "Um download expirou" : `${expired.length} downloads expiraram`} porque a assinatura terminou. Renove o plano Trimestral ou Anual e abra a app com rede para voltar a ouvir offline.
          </p>
          <button type="button" onClick={() => void purgeExpired()} className="mt-3 text-xs text-gold-light underline underline-offset-2">
            Apagar do telemóvel
          </button>
        </div>
      )}

      {error && <p role="alert" className="mt-6 text-sm text-danger">{error}</p>}

      {now && (
        <div className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="glass-strong mx-auto max-w-3xl rounded-[1.4rem] p-4">
            <div className="flex items-center gap-3">
              <p className="min-w-0 flex-1 truncate text-sm text-paper">{now.title}</p>
              <button type="button" onClick={() => nextRef.current(-1)} className="press grid h-10 w-10 place-items-center rounded-full text-paper/80" aria-label="Anterior">
                <SkipBack className="h-4.5 w-4.5" />
              </button>
              <button type="button" onClick={() => toggle()} className="press grid h-12 w-12 place-items-center rounded-full bg-paper text-ink" aria-label={playing ? "Pausar" : "Reproduzir"}>
                {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </button>
              <button type="button" onClick={() => nextRef.current(1)} className="press grid h-10 w-10 place-items-center rounded-full text-paper/80" aria-label="Seguinte">
                <SkipForward className="h-4.5 w-4.5" />
              </button>
            </div>
            <div className="mt-3 flex items-center gap-3 text-[0.7rem] tabular-nums text-mute">
              <span>{fmt(pos)}</span>
              <input
                type="range"
                min={0}
                max={dur || 0}
                step={1}
                value={Math.min(pos, dur || 0)}
                onChange={(e) => {
                  const a = audioRef.current;
                  if (a) a.currentTime = Number(e.target.value);
                }}
                className="aurea-range flex-1"
                style={{ ["--fill" as string]: `${dur ? (pos / dur) * 100 : 0}%` }}
                aria-label="Posição"
              />
              <span>{fmt(dur)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
