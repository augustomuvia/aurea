"use client";
import { useEffect, useRef } from "react";

/** Submete o formulário de filtros quando um chip muda (melhoria progressiva). */
export function AutoSubmitClient() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const onChange = (e: Event) => {
      if ((e.target as HTMLInputElement).type === "radio") form.requestSubmit();
    };
    form.addEventListener("change", onChange);
    return () => form.removeEventListener("change", onChange);
  }, []);
  return <span ref={ref} hidden />;
}
