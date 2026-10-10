import { z } from "zod";

const email = z.string().trim().toLowerCase().email("E-mail inválido.").max(200);
const password = z
  .string()
  .min(10, "A palavra-passe deve ter pelo menos 10 caracteres.")
  .max(128, "A palavra-passe é demasiado longa.")
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), "Use letras e números.");

export const registerSchema = z.object({
  fullName: z.string().trim().min(2, "Indique o seu nome.").max(120),
  email,
  password,
  acceptTerms: z.literal("on", { errorMap: () => ({ message: "É necessário aceitar os termos e a política de privacidade." }) }),
});

export const loginSchema = z.object({ email, password: z.string().min(1, "Indique a palavra-passe.").max(128) });
export const recoverSchema = z.object({ email });
export const newPasswordSchema = z
  .object({ password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "As palavras-passe não coincidem.", path: ["confirm"] });

export const profileSchema = z.object({ fullName: z.string().trim().min(2, "Indique o seu nome.").max(120) });

export const preferencesSchema = z.object({
  preferredCategories: z.array(z.string().regex(/^[a-z0-9-]{2,60}$/)).max(12),
  marketingConsent: z.boolean(),
  analyticsConsent: z.boolean(),
});

export const reportPaymentSchema = z.object({
  reference: z.string().regex(/^AUR-[A-Z0-9]{8}$/, "Referência inválida."),
  transactionId: z
    .string()
    .trim()
    .min(4, "Indique o identificador da transação do comprovativo.")
    .max(64)
    .regex(/^[A-Za-z0-9\-_/. ]+$/, "Use apenas letras, números e - _ / ."),
  note: z.string().trim().max(500).optional().default(""),
});

export const supportSchema = z.object({
  name: z.string().trim().min(2, "Indique o seu nome.").max(120),
  email,
  subject: z.string().trim().min(3, "Indique o assunto.").max(160),
  message: z.string().trim().min(10, "Descreva o pedido com um pouco mais de detalhe.").max(4000),
});

const optionalNumber = z.preprocess((v) => (v === "" || v === null || v === undefined ? null : Number(v)), z.number().positive().max(100000).nullable());
const optionalInt = z.preprocess((v) => (v === "" || v === null || v === undefined ? null : Number(v)), z.number().int().positive().max(86400 * 2).nullable());

export const contentSchema = z.object({
  title: z.string().trim().min(2, "Indique o título.").max(140),
  slug: z.string().trim().regex(/^[a-z0-9-]{2,90}$/, "Use apenas letras minúsculas, números e hífenes.").optional().or(z.literal("")),
  description: z.string().trim().max(2000).default(""),
  // Vazio só é aceite em conteúdos que já têm áudio próprio (verificado na ação).
  youtubeUrl: z.string().trim().max(500).default(""),
  declaredFrequencyHz: optionalNumber,
  durationSeconds: optionalInt,
  coverUrl: z.string().trim().url("URL inválido.").startsWith("https://", "Use um URL https.").optional().or(z.literal("")),
  categoryIds: z.array(z.string().uuid()).max(8),
  recommendedUse: z.array(z.enum(["relaxamento", "meditacao", "concentracao", "sono"])).max(4),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(20),
  isPremium: z.boolean(),
  isBinaural: z.boolean(),
  isFeatured: z.boolean(),
  featuredOrder: z.coerce.number().int().min(0).max(999).default(0),
  status: z.enum(["draft", "published", "unpublished", "removed"]),
});

export const planSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300),
  priceKz: z.coerce.number().int("Use um valor inteiro em kwanzas.").min(100, "Valor mínimo 100 Kz.").max(10_000_000),
  features: z.array(z.string().trim().min(2).max(120)).max(12),
  isActive: z.boolean(),
  isHighlighted: z.boolean(),
  includesOwnAudio: z.boolean(),
  checkoutUrl: z.string().trim().max(2000),
});

export const reasonSchema = z.string().trim().min(5, "Indique um motivo (mínimo 5 caracteres).").max(500);
export const evidenceSchema = z.string().trim().min(10, "Descreva a evidência verificada (mínimo 10 caracteres).").max(1000);

export function fieldErrors(error: z.ZodError) {
  return error.flatten().fieldErrors as Record<string, string[] | undefined>;
}
