import { NextResponse } from "next/server";
import { getPublicEbook } from "@/lib/ebook/server";

export const dynamic = "force-dynamic";

/**
 * Encaminha para o checkout externo da Kursinha configurado no admin.
 * O URL vem sempre da configuração publicada no servidor (nunca de parâmetros do navegador).
 * Não regista nem simula compras: o pagamento acontece inteiramente na Kursinha.
 */
export async function GET(request: Request) {
  const ebook = await getPublicEbook();
  const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
  if (!ebook) return NextResponse.redirect(new URL("/ebook", request.url), { status: 303, headers });
  return NextResponse.redirect(ebook.checkoutUrl, { status: 303, headers });
}
