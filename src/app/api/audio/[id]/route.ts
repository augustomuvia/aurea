import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { CONTENT_AUDIO_BUCKET } from "@/lib/audio";

export const dynamic = "force-dynamic";

/** Válido o suficiente para ouvir uma faixa longa com pausas sem voltar a pedir. */
const SIGNED_SECONDS = 6 * 60 * 60;

/**
 * Áudio próprio de um conteúdo. A leitura de content_media passa pelo RLS
 * (content_media_entitled): só quem pode reproduzir o conteúdo recebe o ficheiro.
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse(null, { status: 404 });
  const supabase = await createClient();
  const { data } = await supabase.from("content_media").select("audio_path").eq("content_id", id).maybeSingle();
  if (!data?.audio_path) return new NextResponse(null, { status: 404 });
  const { data: signed } = await createServiceClient().storage.from(CONTENT_AUDIO_BUCKET).createSignedUrl(data.audio_path, SIGNED_SECONDS);
  if (!signed?.signedUrl) return new NextResponse(null, { status: 404 });
  return NextResponse.redirect(signed.signedUrl, { status: 302, headers: { "Cache-Control": "private, no-store" } });
}
