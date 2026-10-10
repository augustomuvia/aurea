export type SubscriptionStatus = "pending_payment" | "active" | "expired" | "suspended" | "cancelled";
export type PaymentStatus = "pending" | "confirmed" | "rejected" | "cancelled" | "expired" | "reversed";
export type ContentStatus = "draft" | "published" | "unpublished" | "removed";
export type AccountStatus = "active" | "suspended" | "closed";

export interface Plan {
  id: string;
  code: string;
  name: string;
  description: string;
  amount_minor: number;
  currency: "AOA";
  duration_months: number;
  features: string[];
  is_active: boolean;
  is_highlighted: boolean;
  sort_order: number;
  /** Checkout externo (Kursinha). Vazio: Multicaixa Express com verificação manual. */
  checkout_url: string | null;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string;
  kind: "purpose" | "frequency" | "ambient";
  sort_order: number;
  is_visible: boolean;
}

export interface ContentItem {
  id: string;
  slug: string;
  title: string;
  description: string;
  declared_frequency_hz: number | null;
  is_binaural: boolean;
  duration_seconds: number | null;
  cover_url: string | null;
  youtube_video_id: string;
  status: ContentStatus;
  is_premium: boolean;
  is_featured: boolean;
  featured_order: number;
  recommended_use: string[];
  tags: string[];
  embed_error: string | null;
  published_at: string | null;
  created_at: string;
  content_categories?: { categories: Pick<Category, "slug" | "name"> | null }[];
}

export interface Subscription {
  id: string;
  user_id: string;
  plan_id: string | null;
  status: SubscriptionStatus;
  starts_at: string | null;
  expires_at: string | null;
  payment_method: "multicaixa_express" | "manual_grant" | null;
  transaction_id: string | null;
  last_confirmed_at: string | null;
  status_reason: string | null;
  plans?: Pick<Plan, "name" | "code"> | null;
}

export interface Payment {
  id: string;
  user_id: string | null;
  plan_id: string;
  reference: string;
  amount_minor: number;
  status: PaymentStatus;
  provider: "manual_review" | "partner" | "kursinha";
  provider_transaction_id: string | null;
  customer_reported_transaction_id: string | null;
  customer_note: string | null;
  customer_reported_at: string | null;
  verification_evidence: string | null;
  confirmed_at: string | null;
  rejected_reason: string | null;
  proof_path: string | null;
  proof_mime: string | null;
  proof_size: number | null;
  proof_uploaded_at: string | null;
  created_at: string;
  plans?: Pick<Plan, "name" | "code" | "duration_months"> | null;
  profiles?: { email: string; full_name: string } | null;
}

/** Item mínimo que o player precisa. O videoId só chega ao cliente se o servidor autorizar. */
export interface PlayableTrack {
  contentId: string;
  slug: string;
  title: string;
  category: string | null;
  frequencyHz: number | null;
  isBinaural: boolean;
  coverUrl: string;
  videoId: string;
  durationSeconds: number | null;
}

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };
