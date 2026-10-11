import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabasePublicKey, supabaseUrl } from "./keys";
import { UTM_COOKIE, UTM_MAX_AGE, utmFromSearch } from "@/lib/utm";

const PROTECTED = ["/app", "/admin", "/checkout"];

/** Guarda a origem da visita (última campanha com UTMs) para o checkout. */
function rememberUtm(request: NextRequest, response: NextResponse) {
  const utm = utmFromSearch(request.nextUrl.searchParams);
  if (utm) response.cookies.set(UTM_COOKIE, JSON.stringify(utm), { maxAge: UTM_MAX_AGE, path: "/", sameSite: "lax", secure: true, httpOnly: true });
  return response;
}

export async function updateSession(request: NextRequest) {
  return rememberUtm(request, await refreshSession(request));
}

async function refreshSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = supabaseUrl();
  const key = supabasePublicKey();
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  // Renova a sessão. A autorização real é feita de novo em cada página/ação no servidor.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  if (!user && PROTECTED.some((p) => path === p || path.startsWith(`${p}/`))) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/login";
    redirect.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(redirect);
  }
  return response;
}
