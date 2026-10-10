"use client";
import { createBrowserClient } from "@supabase/ssr";
import { supabasePublicKey, supabaseUrl } from "./keys";

export function createClient() {
  return createBrowserClient(supabaseUrl()!, supabasePublicKey()!);
}
