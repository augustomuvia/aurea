/** Evita redirecionamentos abertos: só aceita caminhos relativos internos. */
export function safeNext(next: unknown, fallback = "/app") {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") ? n : fallback;
}
