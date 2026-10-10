"use client";
import { useEffect } from "react";
import { purgeExpired, refreshOfflineAccess } from "@/lib/offline";

/**
 * Regista o service worker (abre /offline sem rede), atualiza a página offline guardada
 * e renova o prazo dos downloads com o estado atual da assinatura.
 */
export function OfflineSync({ access }: { access: { allowed: boolean; until: string | null } }) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js")
      .then(async (reg) => {
        await navigator.serviceWorker.ready;
        (reg.active ?? reg.waiting ?? reg.installing)?.postMessage("refresh-shell");
      })
      .catch(() => undefined);
  }, []);

  const { allowed, until } = access;
  useEffect(() => {
    void refreshOfflineAccess({ allowed, until }).then(purgeExpired);
  }, [allowed, until]);

  return null;
}
