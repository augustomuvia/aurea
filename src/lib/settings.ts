import "server-only";
import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/admin";

export interface PlatformSettings {
  brand: { name: string; slogan: string; logo_url: string | null };
  support: { email: string | null; phone: string | null; whatsapp: string | null; hours: string | null };
  announcement: { active: boolean; message: string };
  maintenance: { enabled: boolean; message: string };
  payment: { mode: string; mcx_recipient_name: string | null; mcx_recipient_phone: string | null; instructions: string | null };
  email: { from_name: string; from_email: string | null; send_payment_emails: boolean };
  legal: { company_name: string | null; nif: string | null; address: string | null; terms_updated_at: string; privacy_updated_at: string };
}

export const DEFAULT_SETTINGS: PlatformSettings = {
  brand: { name: "AUREA", slogan: "Encontre o seu estado de equilíbrio.", logo_url: null },
  support: { email: null, phone: null, whatsapp: null, hours: null },
  announcement: { active: false, message: "" },
  maintenance: { enabled: false, message: "Estamos a fazer melhorias. Voltamos em breve." },
  payment: { mode: "manual_review", mcx_recipient_name: null, mcx_recipient_phone: null, instructions: null },
  email: { from_name: "AUREA", from_email: null, send_payment_emails: true },
  legal: { company_name: null, nif: null, address: null, terms_updated_at: "2026-10-10", privacy_updated_at: "2026-10-10" },
};

export const getSettings = cache(async (): Promise<PlatformSettings> => {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return DEFAULT_SETTINGS;
  try {
    const { data } = await createServiceClient().from("platform_settings").select("key, value");
    const out = structuredClone(DEFAULT_SETTINGS) as unknown as Record<string, Record<string, unknown>>;
    for (const row of data ?? []) {
      if (row.key in out) out[row.key] = { ...out[row.key], ...(row.value as Record<string, unknown>) };
    }
    return out as unknown as PlatformSettings;
  } catch {
    return DEFAULT_SETTINGS;
  }
});
