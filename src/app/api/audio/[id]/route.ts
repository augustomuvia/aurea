import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { CONTENT_AUDIO_BUCKET } from "@/lib/audio";
import { getOwnAudioAccess } from "@/lib/audio-access";

export const dynamic = "force-dynamic";

/** Válido o suficiente para ouvir uma faixa longa com pausas sem voltar a pedir. */
const SIGNED_SECONDS = 6 * 60 * 60;
const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * Áudio próprio de um conteúdo. A leitura de content_media passa pelo RLS
 * (content_media_entitled): só quem pode reproduzir o conteúdo recebe o ficheiro,
 * e só se o plano incluir o áudio AUREA (Trimestral e Anual).
 *
 * ?offline=1 devolve JSON { url, until } para descarregar e ouvir sem rede até ao fim da assinatura.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse(null, { status: 404 });
  const access = await getOwnAudioAccess();
  if (!access.allowed) return NextResponse.json({ error: "plan_required" }, { status: 403, headers: NO_STORE });
  const supabase = await createClient();
  const { data } = await supabase.from("content_media").select("audio_path").eq("content_id", id).maybeSingle();
  if (!data?.audio_path) return new NextResponse(null, { status: 404 });
  const { data: signed } = await createServiceClient().storage.from(CONTENT_AUDIO_BUCKET).createSignedUrl(data.audio_path, SIGNED_SECONDS);
  if (!signed?.signedUrl) return new NextResponse(null, { status: 404 });
  if (new URL(request.url).searchParams.get("offline") === "1") {
    return NextResponse.json({ url: signed.signedUrl, until: access.until }, { headers: NO_STORE });
  }
  return NextResponse.redirect(signed.signedUrl, { status: 302, headers: NO_STORE });
}
