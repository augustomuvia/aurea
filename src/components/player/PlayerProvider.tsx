"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { PlayableTrack } from "@/lib/types";
import { describePlayerError } from "@/lib/youtube";
import { loadYouTubeApi, YT_STATE, type YTPlayer } from "./youtube-api";
import { recordPlayback, reportEmbedError, toggleFavorite } from "@/app/app/actions";

export type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "ended" | "error";
export type PlayerMode = "mini" | "expanded" | "collapsed";

interface PlayerContextValue {
  queue: PlayableTrack[];
  index: number;
  current: PlayableTrack | null;
  status: PlayerStatus;
  error: string | null;
  mode: PlayerMode;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  favorites: Set<string>;
  playQueue: (tracks: PlayableTrack[], startIndex?: number, resumeAt?: number) => void;
  toggle: () => void;
  pause: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
  skip: (delta: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  setMode: (m: PlayerMode) => void;
  jumpTo: (i: number) => void;
  toggleFav: (contentId: string) => Promise<void>;
  close: () => void;
  /** Elemento onde o iframe do YouTube vive (montado uma única vez). */
  hostRef: React.RefObject<HTMLDivElement | null>;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer fora do PlayerProvider");
  return ctx;
}

/** Versão tolerante (para componentes que podem ser renderizados fora da área /app). */
export function useOptionalPlayer() {
  return useContext(PlayerContext);
}

const SAVE_EVERY_MS = 20_000;

export function PlayerProvider({ children, initialFavorites }: { children: ReactNode; initialFavorites: string[] }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const readyRef = useRef<Promise<YTPlayer> | null>(null);
  const pendingStartRef = useRef<number>(0);
  const lastSaveRef = useRef<number>(0);
  const newPlayRef = useRef<boolean>(false);

  const [queue, setQueue] = useState<PlayableTrack[]>([]);
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState<PlayerStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<PlayerMode>("mini");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(80);
  const [muted, setMuted] = useState(false);
  const [favorites, setFavorites] = useState(() => new Set(initialFavorites));

  const current = queue[index] ?? null;
  const currentRef = useRef<PlayableTrack | null>(null);
  currentRef.current = current;
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const indexRef = useRef(index);
  indexRef.current = index;

  const persist = useCallback((isNewPlay = false) => {
    const t = currentRef.current;
    const p = playerRef.current;
    if (!t || !p) return;
    const pos = Math.floor(p.getCurrentTime?.() ?? 0);
    const dur = Math.floor(p.getDuration?.() ?? 0);
    lastSaveRef.current = Date.now();
    void recordPlayback({ contentId: t.contentId, position: pos, duration: dur, newPlay: isNewPlay }).catch(() => undefined);
  }, []);

  const advance = useCallback((delta: number) => {
    const q = queueRef.current;
    const i = indexRef.current + delta;
    if (i < 0 || i >= q.length) return false;
    setIndex(i);
    setError(null);
    pendingStartRef.current = 0;
    newPlayRef.current = true;
    setStatus("loading");
    playerRef.current?.loadVideoById({ videoId: q[i].videoId, startSeconds: 0 });
    return true;
  }, []);

  /** Cria o player apenas uma vez; as mudanças de faixa usam loadVideoById. */
  const ensurePlayer = useCallback((): Promise<YTPlayer> => {
    if (playerRef.current) return Promise.resolve(playerRef.current);
    if (readyRef.current) return readyRef.current;
    readyRef.current = loadYouTubeApi().then(
      (YT) =>
        new Promise<YTPlayer>((resolve) => {
          const mount = document.createElement("div");
          hostRef.current?.replaceChildren(mount);
          new YT.Player(mount, {
            host: "https://www.youtube-nocookie.com",
            width: "100%",
            height: "100%",
            playerVars: { playsinline: 1, rel: 0, controls: 0, iv_load_policy: 3, origin: window.location.origin, enablejsapi: 1 },
            events: {
              onReady: (e) => {
                playerRef.current = e.target;
                e.target.setVolume(volume);
                resolve(e.target);
              },
              onStateChange: (e) => {
                switch (e.data) {
                  case YT_STATE.PLAYING:
                    setStatus("playing");
                    setError(null);
                    setDuration(e.target.getDuration() || 0);
                    if (newPlayRef.current) {
                      newPlayRef.current = false;
                      persist(true);
                    }
                    break;
                  case YT_STATE.PAUSED:
                    setStatus("paused");
                    persist();
                    break;
                  case YT_STATE.BUFFERING:
                    setStatus("loading");
                    break;
                  case YT_STATE.ENDED:
                    persist();
                    if (!advance(1)) setStatus("ended");
                    break;
                  case YT_STATE.CUED:
                    setStatus("paused");
                    break;
                }
              },
              onError: (e) => {
                setStatus("error");
                setError(describePlayerError(e.data));
                const t = currentRef.current;
                if (t) void reportEmbedError({ contentId: t.contentId, code: e.data }).catch(() => undefined);
              },
            },
          });
        }),
    );
    readyRef.current.catch(() => {
      readyRef.current = null;
      if (currentRef.current) {
        setStatus("error");
        setError("Não foi possível carregar o leitor. Verifique a ligação e tente novamente.");
      }
    });
    return readyRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advance, persist]);

  // Prepara o leitor vazio (sem vídeo) quando a área /app é aberta, para que o
  // primeiro clique em "Reproduzir" inicie o som de forma síncrona (iOS/Safari).
  useEffect(() => {
    void ensurePlayer().catch(() => undefined);
  }, [ensurePlayer]);

  // Progresso e gravação periódica da posição.
  useEffect(() => {
    if (status !== "playing") return;
    const id = window.setInterval(() => {
      const p = playerRef.current;
      if (!p) return;
      setCurrentTime(p.getCurrentTime() || 0);
      const d = p.getDuration() || 0;
      if (d) setDuration(d);
      if (Date.now() - lastSaveRef.current > SAVE_EVERY_MS) persist();
    }, 500);
    return () => window.clearInterval(id);
  }, [status, persist]);

  // Guarda a posição ao sair da página.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") persist();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [persist]);

  /**
   * Inicia uma fila. Deve ser chamado a partir de uma interação do utilizador
   * (clique): nunca há reprodução automática com som antes disso.
   */
  const playQueue = useCallback(
    (tracks: PlayableTrack[], startIndex = 0, resumeAt = 0) => {
      if (!tracks.length) return;
      const t = tracks[startIndex];
      setQueue(tracks);
      setIndex(startIndex);
      setError(null);
      setStatus("loading");
      setCurrentTime(resumeAt);
      setDuration(t.durationSeconds ?? 0);
      if (mode === "collapsed") setMode("mini");
      pendingStartRef.current = resumeAt;
      newPlayRef.current = true;
      const p = playerRef.current;
      if (p) {
        p.loadVideoById({ videoId: t.videoId, startSeconds: Math.floor(resumeAt) });
      } else {
        void ensurePlayer().then((pl) => pl.loadVideoById({ videoId: t.videoId, startSeconds: Math.floor(resumeAt) }));
      }
    },
    [ensurePlayer, mode],
  );

  const pause = useCallback(() => playerRef.current?.pauseVideo(), []);
  const toggle = useCallback(() => {
    const p = playerRef.current;
    if (!p || !currentRef.current) return;
    if (status === "playing" || status === "loading") p.pauseVideo();
    else if (status === "ended") {
      p.seekTo(0, true);
      p.playVideo();
    } else p.playVideo();
  }, [status]);

  const seek = useCallback((s: number) => {
    const p = playerRef.current;
    if (!p) return;
    p.seekTo(Math.max(0, s), true);
    setCurrentTime(Math.max(0, s));
  }, []);
  const skip = useCallback((delta: number) => {
    const p = playerRef.current;
    if (!p) return;
    const target = Math.max(0, Math.min((p.getCurrentTime() || 0) + delta, (p.getDuration() || Infinity) - 1));
    p.seekTo(target, true);
    setCurrentTime(target);
  }, []);
  const setVolume = useCallback((v: number) => {
    const val = Math.round(Math.max(0, Math.min(100, v)));
    setVolumeState(val);
    playerRef.current?.setVolume(val);
    if (val > 0 && playerRef.current?.isMuted()) {
      playerRef.current.unMute();
      setMuted(false);
    }
  }, []);
  const toggleMute = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    if (p.isMuted()) {
      p.unMute();
      setMuted(false);
    } else {
      p.mute();
      setMuted(true);
    }
  }, []);

  const changeMode = useCallback((m: PlayerMode) => {
    // O YouTube exige que o vídeo esteja visível durante a reprodução:
    // ao recolher o player para a barra compacta, a reprodução é pausada.
    if (m === "collapsed") playerRef.current?.pauseVideo();
    setMode(m);
  }, []);

  const toggleFav = useCallback(async (contentId: string) => {
    setFavorites((prev) => {
      const n = new Set(prev);
      if (n.has(contentId)) n.delete(contentId);
      else n.add(contentId);
      return n;
    });
    const r = await toggleFavorite(contentId).catch(() => ({ ok: false as const }));
    if (!r.ok) {
      setFavorites((prev) => {
        const n = new Set(prev);
        if (n.has(contentId)) n.delete(contentId);
        else n.add(contentId);
        return n;
      });
    }
  }, []);

  const close = useCallback(() => {
    persist();
    playerRef.current?.stopVideo();
    setQueue([]);
    setIndex(0);
    setStatus("idle");
    setMode("mini");
    setError(null);
  }, [persist]);

  const value = useMemo<PlayerContextValue>(
    () => ({
      queue,
      index,
      current,
      status,
      error,
      mode,
      currentTime,
      duration,
      volume,
      muted,
      favorites,
      playQueue,
      toggle,
      pause,
      next: () => void advance(1),
      previous: () => {
        const p = playerRef.current;
        if (p && (p.getCurrentTime() || 0) > 5) seek(0);
        else void advance(-1);
      },
      seek,
      skip,
      setVolume,
      toggleMute,
      setMode: changeMode,
      jumpTo: (i: number) => void advance(i - indexRef.current),
      toggleFav,
      close,
      hostRef,
    }),
    [queue, index, current, status, error, mode, currentTime, duration, volume, muted, favorites, playQueue, toggle, pause, advance, seek, skip, setVolume, toggleMute, changeMode, toggleFav, close],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}
