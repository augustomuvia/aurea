"use client";
import { Heart } from "lucide-react";
import { usePlayer } from "@/components/player/PlayerProvider";

export function FavoriteButton({ contentId }: { contentId: string }) {
  const { favorites, toggleFav } = usePlayer();
  const on = favorites.has(contentId);
  return (
    <button
      type="button"
      onClick={() => void toggleFav(contentId)}
      aria-pressed={on}
      className="press glass inline-flex h-12 items-center gap-2 rounded-full px-5 text-sm text-paper/85 hover:text-paper"
    >
      <Heart className={`h-4.5 w-4.5 ${on ? "fill-gold text-gold" : ""}`} />
      {on ? "Nos favoritos" : "Favorito"}
    </button>
  );
}
