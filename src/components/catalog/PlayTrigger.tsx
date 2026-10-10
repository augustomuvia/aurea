"use client";
import { Pause, Play } from "lucide-react";
import { useOptionalPlayer } from "@/components/player/PlayerProvider";
import type { PlayableTrack } from "@/lib/types";

export function PlayTrigger({
  queue,
  index,
  resumeAt = 0,
  title,
  variant = "round",
}: {
  queue: PlayableTrack[];
  index: number;
  resumeAt?: number;
  title: string;
  variant?: "round" | "wide";
}) {
  const player = useOptionalPlayer();
  if (!player) return null;
  const isCurrent = player.current?.contentId === queue[index]?.contentId;
  const playing = isCurrent && (player.status === "playing" || player.status === "loading");
  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isCurrent) {
      if (player.mode === "collapsed") player.setMode("mini");
      player.toggle();
    } else player.playQueue(queue, index, resumeAt);
  };
  if (variant === "wide") {
    return (
      <button
        type="button"
        onClick={onClick}
        className="press relative z-10 inline-flex h-12 items-center gap-2.5 rounded-full bg-gradient-to-b from-gold-light to-gold px-6 font-medium text-ink shadow-[0_10px_40px_-12px_rgba(214,180,106,0.7),inset_0_1px_0_rgba(255,255,255,0.5)]"
      >
        {playing ? <Pause className="h-4.5 w-4.5 fill-current" /> : <Play className="h-4.5 w-4.5 fill-current" />}
        {playing ? "Pausar" : resumeAt > 5 && !isCurrent ? "Retomar" : "Reproduzir"}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${playing ? "Pausar" : "Reproduzir"} ${title}`}
      className="press relative z-10 grid h-11 w-11 place-items-center rounded-full bg-gradient-to-b from-gold-light to-gold text-ink shadow-[0_10px_30px_-10px_rgba(214,180,106,0.8)]"
    >
      {playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 translate-x-[1px] fill-current" />}
    </button>
  );
}
