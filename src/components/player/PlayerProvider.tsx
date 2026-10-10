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
  /** O browser bloqueou o início automático: é preciso tocar no próprio vídeo (Safari/iOS). */
  needsTap: boolean;
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
  /** Volta a criar o leitor (YouTube ou áudio) e tenta tocar a faixa atual. */
  retry: () => void;
  /** A faixa atual toca pelo áudio próprio (continua com o ecrã bloqueado). */
  usingAudio: boolean;
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
/**
 * Tempo até avisar que o leitor do YouTube está lento. Não é fatal: em redes móveis
 * lentas o leitor pode ficar pronto depois disso e a reprodução continua.
 */
const READY_TIMEOUT_MS = 20_000;
// Os códigos (L1/L2/A1) ajudam a saber, por uma captura de ecrã, em que passo falhou.
const LOAD_ERROR = "O leitor está a demorar a carregar. Verifique a ligação ou toque em Tentar novamente. (L2)";
const SCRIPT_ERROR = "Não foi possível carregar o leitor. Verifique a ligação e tente novamente. (L1)";
const AUDIO_ERROR = "Não foi possível tocar este áudio. Verifique a ligação e tente novamente. (A1)";
/** Sem reprodução ao fim deste tempo, assume-se que o browser bloqueou o início automático. */
const START_WATCHDOG_MS = 4_000;

/** O que os controlos usam, seja o leitor do YouTube seja o elemento <audio>. */
type Engine = Pick<
  YTPlayer,
  "playVideo" | "pauseVideo" | "stopVideo" | "seekTo" | "setVolume" | "mute" | "unMute" | "isMuted" | "getCurrentTime" | "getDuration"
>;

export function PlayerProvider({ children, initialFavorites }: { children: ReactNode; initialFavorites: string[] }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const readyRef = useRef<Promise<YTPlayer> | null>(null);
  /** Cada criação do leitor tem um número; eventos de leitores antigos são ignorados. */
  const genRef = useRef(0);
  const ensurePlayerRef = useRef<((initial?: { videoId: string; start: number }) => Promise<YTPlayer>) | null>(null);
  /**
   * Áudio próprio: um elemento <audio> continua a tocar com o ecrã bloqueado ou com
   * o navegador em segundo plano (o iframe do YouTube não). Criado no primeiro uso,
   * dentro do toque do utilizador, e reutilizado para as faixas seguintes.
   */
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const usingAudioRef = useRef(false);
  const [usingAudio, setUsingAudio] = useState(false);
  const pendingSeekRef = useRef(0);
  const advanceRef = useRef<(delta: number) => boolean>(() => false);
  const fallbackRef = useRef<() => void>(() => undefined);
  const pendingStartRef = useRef<number>(0);
  const lastSaveRef = useRef<number>(0);
  const newPlayRef = useRef<boolean>(false);

  const [queue, setQueue] = useState<PlayableTrack[]>([]);
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState<PlayerStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [needsTap, setNeedsTap] = useState(false);
  const startWatchRef = useRef<number | null>(null);
  const [mode, setMode] = useState<PlayerMode>("mini");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(80);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const [muted, setMuted] = useState(false);
  const [favorites, setFavorites] = useState(() => new Set(initialFavorites));

  const current = queue[index] ?? null;
  const currentRef = useRef<PlayableTrack | null>(null);
  currentRef.current = current;
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const indexRef = useRef(index);
  indexRef.current = index;

  const audioEngine = useMemo<Engine>(
    () => ({
      playVideo: () => {
        const a = audioRef.current;
        if (!a) return;
        void a.play().catch((err: unknown) => {
          // Sem gesto do utilizador o browser recusa: fica em pausa até carregar em Reproduzir.
          if (err instanceof DOMException && err.name === "NotAllowedError") setStatus("paused");
        });
      },
      pauseVideo: () => audioRef.current?.pause(),
      stopVideo: () => {
        const a = audioRef.current;
        if (!a) return;
        a.pause();
        a.removeAttribute("src");
        a.load();
      },
      seekTo: (sec: number) => {
        if (audioRef.current) audioRef.current.currentTime = sec;
      },
      setVolume: (v: number) => {
        // No iPhone o volume é só o dos botões do telemóvel; aqui é ignorado.
        if (audioRef.current) audioRef.current.volume = Math.max(0, Math.min(1, v / 100));
      },
      mute: () => {
        if (audioRef.current) audioRef.current.muted = true;
      },
      unMute: () => {
        if (audioRef.current) audioRef.current.muted = false;
      },
      isMuted: () => audioRef.current?.muted ?? false,
      getCurrentTime: () => audioRef.current?.currentTime ?? 0,
      getDuration: () => {
        const d = audioRef.current?.duration ?? 0;
        return Number.isFinite(d) ? d : 0;
      },
    }),
    [],
  );

  /** Motor da faixa atual: áudio próprio ou leitor do YouTube (se já existir). */
  const engine = useCallback((): Engine | null => (usingAudioRef.current ? audioEngine : playerRef.current), [audioEngine]);

  const persist = useCallback(
    (isNewPlay = false) => {
      const t = currentRef.current;
      const p = engine();
      if (!t || !p) return;
      const pos = Math.floor(p.getCurrentTime?.() ?? 0);
      const dur = Math.floor(p.getDuration?.() ?? 0);
      lastSaveRef.current = Date.now();
      void recordPlayback({ contentId: t.contentId, position: pos, duration: dur, newPlay: isNewPlay }).catch(() => undefined);
    },
    [engine],
  );

  const clearStartWatch = useCallback(() => {
    if (startWatchRef.current !== null) window.clearTimeout(startWatchRef.current);
    startWatchRef.current = null;
  }, []);

  /**
   * O Safari (e o iOS) só deixa o vídeo de um iframe começar com som depois de
   * um toque dentro do próprio iframe. Se a reprodução não arrancar, deixa de
   * mostrar "a carregar" e pede ao utilizador para tocar no vídeo.
   */
  const watchStart = useCallback(() => {
    clearStartWatch();
    setNeedsTap(false);
    startWatchRef.current = window.setTimeout(() => {
      startWatchRef.current = null;
      setStatus((s) => (s === "loading" ? "paused" : s));
      setNeedsTap(true);
    }, START_WATCHDOG_MS);
  }, [clearStartWatch]);

  // Eventos comuns aos dois motores.
  const markPlaying = useCallback(
    (dur: number) => {
      clearStartWatch();
      setNeedsTap(false);
      setStatus("playing");
      setError(null);
      setDuration(dur || 0);
      if (newPlayRef.current) {
        newPlayRef.current = false;
        persist(true);
      }
    },
    [clearStartWatch, persist],
  );
  const markPaused = useCallback(() => {
    setStatus("paused");
    persist();
  }, [persist]);
  const markEnded = useCallback(() => {
    persist();
    if (!advanceRef.current(1)) setStatus("ended");
  }, [persist]);

  const getAudio = useCallback(() => {
    if (audioRef.current) return audioRef.current;
    const a = new Audio();
    a.preload = "auto";
    const mine = () => usingAudioRef.current;
    a.addEventListener("playing", () => mine() && markPlaying(audioEngine.getDuration()));
    a.addEventListener("pause", () => mine() && !a.ended && a.getAttribute("src") && markPaused());
    a.addEventListener("waiting", () => mine() && setStatus("loading"));
    a.addEventListener("ended", () => mine() && markEnded());
    a.addEventListener("loadedmetadata", () => {
      if (!mine()) return;
      if (pendingSeekRef.current > 0) a.currentTime = pendingSeekRef.current;
      pendingSeekRef.current = 0;
      setDuration(audioEngine.getDuration());
    });
    a.addEventListener("error", () => {
      if (mine() && a.getAttribute("src")) fallbackRef.current();
    });
    audioRef.current = a;
    return a;
  }, [audioEngine, markPlaying, markPaused, markEnded]);

  /** Cria o player apenas uma vez; as mudanças de faixa usam loadVideoById. */
  const ensurePlayer = useCallback((initial?: { videoId: string; start: number }): Promise<YTPlayer> => {
    if (playerRef.current) return Promise.resolve(playerRef.current);
    if (readyRef.current) return readyRef.current;
    const gen = ++genRef.current;
    const stale = () => gen !== genRef.current;
    let timedOut = false;
    const ready = loadYouTubeApi().then(
      (YT) =>
        new Promise<YTPlayer>((resolve, reject) => {
          const timer = window.setTimeout(() => {
            timedOut = true;
            reject(new Error("timeout"));
          }, READY_TIMEOUT_MS);
          const mount = document.createElement("div");
          hostRef.current?.replaceChildren(mount);
          // O leitor é criado já com o vídeo escolhido (um leitor vazio fica preto
          // no Safari) e com os controlos do YouTube, para que tocar no vídeo
          // funcione sempre como gesto do utilizador dentro do iframe.
          new YT.Player(mount, {
            width: "100%",
            height: "100%",
            videoId: initial?.videoId,
            playerVars: {
              playsinline: 1,
              rel: 0,
              controls: 1,
              iv_load_policy: 3,
              origin: window.location.origin,
              enablejsapi: 1,
              ...(initial ? { autoplay: 1, start: initial.start } : {}),
            },
            events: {
              onReady: (e) => {
                window.clearTimeout(timer);
                if (stale()) return;
                playerRef.current = e.target;
                readyRef.current = null;
                try {
                  e.target.setVolume(volumeRef.current);
                } catch {
                  // iOS não deixa controlar o volume por JavaScript.
                }
                const want = currentRef.current;
                // Fechado, ou a faixa atual passou a tocar pelo áudio próprio.
                if (!want || usingAudioRef.current) {
                  e.target.stopVideo();
                  resolve(e.target);
                  return;
                }
                if (timedOut) {
                  // Ficou pronto depois do aviso de lentidão: tira o aviso e
                  // pede um toque no vídeo (o gesto original já expirou).
                  setError(null);
                  setStatus("paused");
                  setNeedsTap(true);
                }
                // Se a faixa mudou enquanto o leitor carregava, toca a atual.
                if (want.videoId !== initial?.videoId) e.target.loadVideoById({ videoId: want.videoId, startSeconds: 0 });
                else if (initial) e.target.playVideo();
                resolve(e.target);
              },
              onStateChange: (e) => {
                if (stale() || usingAudioRef.current) return;
                switch (e.data) {
                  case YT_STATE.PLAYING:
                    markPlaying(e.target.getDuration());
                    break;
                  case YT_STATE.PAUSED:
                    markPaused();
                    break;
                  case YT_STATE.BUFFERING:
                    setStatus("loading");
                    break;
                  case YT_STATE.ENDED:
                    markEnded();
                    break;
                  case YT_STATE.CUED:
                    setStatus("paused");
                    break;
                }
              },
              onError: (e) => {
                if (stale() || usingAudioRef.current) return;
                clearStartWatch();
                setStatus("error");
                setError(describePlayerError(e.data));
                const t = currentRef.current;
                if (t) void reportEmbedError({ contentId: t.contentId, code: e.data }).catch(() => undefined);
              },
            },
          });
        }),
    );
    readyRef.current = ready;
    ready.catch((err: unknown) => {
      if (stale()) return;
      // Com tempo esgotado o leitor continua a carregar: se ficar pronto, o
      // onReady acima tira o aviso. "Tentar novamente" cria um leitor novo.
      readyRef.current = null;
      if (currentRef.current && !usingAudioRef.current) {
        clearStartWatch();
        setStatus("error");
        setError(timedOut ? LOAD_ERROR : SCRIPT_ERROR);
      }
      void err;
    });
    return ready;
  }, [markPlaying, markPaused, markEnded, clearStartWatch]);
  ensurePlayerRef.current = ensurePlayer;

  const selectAudio = useCallback((on: boolean) => {
    usingAudioRef.current = on;
    setUsingAudio(on);
  }, []);

  /** Começa uma faixa. Chamado dentro do toque do utilizador sempre que possível (iOS). */
  const startTrack = useCallback(
    (t: PlayableTrack, start: number, allowAudio = true) => {
      clearStartWatch();
      setNeedsTap(false);
      if (t.audioUrl && allowAudio) {
        selectAudio(true);
        try {
          playerRef.current?.pauseVideo();
        } catch {
          // leitor ainda a carregar
        }
        const a = getAudio();
        pendingSeekRef.current = start;
        a.src = t.audioUrl;
        audioEngine.setVolume(volumeRef.current);
        audioEngine.playVideo();
        return;
      }
      selectAudio(false);
      if (audioRef.current?.getAttribute("src")) audioEngine.stopVideo();
      const p = playerRef.current;
      if (p) p.loadVideoById({ videoId: t.videoId, startSeconds: start });
      else void ensurePlayer({ videoId: t.videoId, start }).catch(() => undefined);
      watchStart();
    },
    [audioEngine, clearStartWatch, ensurePlayer, getAudio, selectAudio, watchStart],
  );

  // Se o áudio próprio falhar (ficheiro em falta, ligação), toca a mesma faixa pelo YouTube.
  fallbackRef.current = () => {
    const t = currentRef.current;
    if (!t) return;
    if (!t.videoId) {
      setStatus("error");
      setError(AUDIO_ERROR);
      return;
    }
    // A1 fica registado na consola para diagnóstico; o utilizador continua a ouvir pelo YouTube.
    console.warn(AUDIO_ERROR);
    setStatus("loading");
    startTrack(t, Math.floor(audioEngine.getCurrentTime() || pendingStartRef.current), false);
  };

  const advance = useCallback(
    (delta: number) => {
      const q = queueRef.current;
      const i = indexRef.current + delta;
      if (i < 0 || i >= q.length) return false;
      setIndex(i);
      currentRef.current = q[i];
      indexRef.current = i;
      setError(null);
      pendingStartRef.current = 0;
      newPlayRef.current = true;
      setStatus("loading");
      setCurrentTime(0);
      startTrack(q[i], 0);
      return true;
    },
    [startTrack],
  );
  advanceRef.current = advance;

  /** Descarta o leitor atual (ou o que não chegou a ficar pronto) e volta a tentar a faixa atual. */
  const retry = useCallback(() => {
    const t = currentRef.current;
    if (!t) return;
    setError(null);
    setStatus("loading");
    newPlayRef.current = true;
    const start = Math.floor(pendingStartRef.current);
    if (!t.audioUrl) {
      genRef.current += 1;
      try {
        playerRef.current?.destroy();
      } catch {
        // leitor já removido
      }
      playerRef.current = null;
      readyRef.current = null;
    }
    startTrack(t, start);
  }, [startTrack]);

  // Carrega o script da API mais cedo; o leitor só é criado no primeiro "Reproduzir".
  useEffect(() => {
    void loadYouTubeApi().catch(() => undefined);
    return () => clearStartWatch();
  }, [clearStartWatch]);

  // Progresso e gravação periódica da posição.
  useEffect(() => {
    if (status !== "playing") return;
    const id = window.setInterval(() => {
      const p = engine();
      if (!p) return;
      const pos = p.getCurrentTime() || 0;
      setCurrentTime(pos);
      const d = p.getDuration() || 0;
      if (d) setDuration(d);
      if (usingAudioRef.current && d && "mediaSession" in navigator) {
        try {
          navigator.mediaSession.setPositionState({ duration: d, position: Math.min(pos, d), playbackRate: 1 });
        } catch {
          // browsers antigos
        }
      }
      if (Date.now() - lastSaveRef.current > SAVE_EVERY_MS) persist();
    }, 500);
    return () => window.clearInterval(id);
  }, [status, persist, engine]);

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
      queueRef.current = tracks;
      indexRef.current = startIndex;
      currentRef.current = t;
      setError(null);
      setStatus("loading");
      setCurrentTime(resumeAt);
      setDuration(t.durationSeconds ?? 0);
      if (mode === "collapsed") setMode("mini");
      pendingStartRef.current = resumeAt;
      newPlayRef.current = true;
      startTrack(t, Math.floor(resumeAt));
    },
    [mode, startTrack],
  );

  const pause = useCallback(() => engine()?.pauseVideo(), [engine]);
  const toggle = useCallback(() => {
    const p = engine();
    if (!currentRef.current) return;
    if (!p) {
      if (!readyRef.current) retry();
      return;
    }
    if (status === "error") retry();
    else if (status === "playing" || status === "loading") p.pauseVideo();
    else if (status === "ended") {
      p.seekTo(0, true);
      p.playVideo();
    } else p.playVideo();
  }, [status, retry, engine]);

  const seek = useCallback(
    (s: number) => {
      const p = engine();
      if (!p) return;
      p.seekTo(Math.max(0, s), true);
      setCurrentTime(Math.max(0, s));
    },
    [engine],
  );
  const skip = useCallback(
    (delta: number) => {
      const p = engine();
      if (!p) return;
      const target = Math.max(0, Math.min((p.getCurrentTime() || 0) + delta, (p.getDuration() || Infinity) - 1));
      p.seekTo(target, true);
      setCurrentTime(target);
    },
    [engine],
  );
  const previous = useCallback(() => {
    const p = engine();
    if (p && (p.getCurrentTime() || 0) > 5) seek(0);
    else void advance(-1);
  }, [engine, seek, advance]);
  const setVolume = useCallback(
    (v: number) => {
      const val = Math.round(Math.max(0, Math.min(100, v)));
      setVolumeState(val);
      const p = engine();
      p?.setVolume(val);
      if (val > 0 && p?.isMuted()) {
        p.unMute();
        setMuted(false);
      }
    },
    [engine],
  );
  const toggleMute = useCallback(() => {
    const p = engine();
    if (!p) return;
    if (p.isMuted()) {
      p.unMute();
      setMuted(false);
    } else {
      p.mute();
      setMuted(true);
    }
  }, [engine]);

  const changeMode = useCallback((m: PlayerMode) => {
    // O YouTube exige que o vídeo esteja visível durante a reprodução: ao recolher
    // o player para a barra compacta, a reprodução é pausada. O áudio próprio continua.
    if (m === "collapsed" && !usingAudioRef.current) playerRef.current?.pauseVideo();
    setMode(m);
  }, []);

  // Ecrã de bloqueio / central de controlo: título, capa e botões (só no áudio próprio).
  const actionsRef = useRef({ toggle, previous, seek, skip });
  actionsRef.current = { toggle, previous, seek, skip };
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    const set = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        // ação não suportada neste browser
      }
    };
    set("play", () => usingAudioRef.current && audioEngine.playVideo());
    set("pause", () => usingAudioRef.current && audioEngine.pauseVideo());
    set("nexttrack", () => void advanceRef.current(1));
    set("previoustrack", () => actionsRef.current.previous());
    set("seekbackward", () => actionsRef.current.skip(-15));
    set("seekforward", () => actionsRef.current.skip(15));
    set("seekto", (d) => {
      if (typeof d.seekTime === "number") actionsRef.current.seek(d.seekTime);
    });
    return () => {
      for (const a of ["play", "pause", "nexttrack", "previoustrack", "seekbackward", "seekforward", "seekto"] as MediaSessionAction[]) set(a, null);
    };
  }, [audioEngine]);
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    if (!current || !usingAudio) {
      navigator.mediaSession.metadata = null;
      return;
    }
    const cover = current.coverUrl.startsWith("/") ? new URL(current.coverUrl, window.location.origin).href : current.coverUrl;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: "AUREA",
      album: current.category ?? "Experiência sonora",
      artwork: [
        { src: cover, sizes: "480x360" },
        { src: new URL("/icons/icon-512.png", window.location.origin).href, sizes: "512x512", type: "image/png" },
      ],
    });
  }, [current, usingAudio]);
  useEffect(() => {
    if (!("mediaSession" in navigator) || !usingAudio) return;
    navigator.mediaSession.playbackState = status === "playing" ? "playing" : status === "idle" ? "none" : "paused";
  }, [status, usingAudio]);

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
    clearStartWatch();
    setNeedsTap(false);
    playerRef.current?.stopVideo();
    if (audioRef.current?.getAttribute("src")) audioEngine.stopVideo();
    selectAudio(false);
    setQueue([]);
    setIndex(0);
    setStatus("idle");
    setMode("mini");
    setError(null);
  }, [persist, clearStartWatch, audioEngine, selectAudio]);

  const value = useMemo<PlayerContextValue>(
    () => ({
      queue,
      index,
      current,
      status,
      error,
      needsTap,
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
      previous,
      seek,
      skip,
      setVolume,
      toggleMute,
      setMode: changeMode,
      jumpTo: (i: number) => void advance(i - indexRef.current),
      toggleFav,
      close,
      retry,
      usingAudio,
      hostRef,
    }),
    [queue, index, current, status, error, needsTap, mode, currentTime, duration, volume, muted, favorites, playQueue, toggle, pause, advance, previous, seek, skip, setVolume, toggleMute, changeMode, toggleFav, close, retry, usingAudio],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}
