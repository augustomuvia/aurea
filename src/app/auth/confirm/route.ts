import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-next";
import { kickQueue } from "@/lib/notifications/server";


/** Verificação de e-mail / recuperação via token_hash (fluxo SSR recomendado pelo Supabase). */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));
  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      // A confirmação do e-mail gera a mensagem de boas-vindas (na base de dados); envia-a já.
      if (type !== "recovery") kickQueue();
      return NextResponse.redirect(`${origin}${type === "recovery" ? "/nova-password" : next}`);
    }
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      kickQueue();
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?erro=ligacao-invalida`);
}
