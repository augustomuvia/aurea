"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { trackPixel } from "@/lib/meta-pixel";

/** PageView em cada página (incluindo navegação dentro da app). */
export function MetaPixel() {
  const pathname = usePathname();
  useEffect(() => {
    trackPixel("PageView");
  }, [pathname]);
  return null;
}

/** Envia um evento uma vez quando a página abre (ex.: registo concluído, início do checkout). */
export function PixelEvent({ event, params }: { event: string; params?: Record<string, unknown> }) {
  const key = JSON.stringify(params ?? null);
  useEffect(() => {
    trackPixel(event, JSON.parse(key) ?? undefined);
  }, [event, key]);
  return null;
}
