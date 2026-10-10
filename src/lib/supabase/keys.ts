// Nomes aceites para as chaves do Supabase. A integração Supabase da Vercel pode
// criar as variáveis com os nomes novos (publishable/secret) em vez de anon/service_role.
// As referências a NEXT_PUBLIC_* ficam literais para o Next.js as incluir no browser.
export function supabaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || undefined;
}

export function supabasePublicKey(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || undefined;
}
