#!/usr/bin/env node
/**
 * Provisionamento seguro do primeiro super admin.
 *
 * 1. O proprietário cria a conta normalmente em /registar e confirma o e-mail.
 * 2. Com as variáveis do servidor definidas localmente (nunca no browser):
 *      SUPER_ADMIN_EMAIL=dono@exemplo.ao npm run admin:bootstrap
 *
 * O papel é escrito com a service role key; não existe nenhum caminho na
 * aplicação web que permita atribuir super_admin.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = (process.env.SUPER_ADMIN_EMAIL ?? process.argv[2] ?? "").trim().toLowerCase();

if (!url || !key) {
  console.error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (!email) {
  console.error("Defina SUPER_ADMIN_EMAIL (ou passe o e-mail como argumento).");
  process.exit(1);
}

const svc = createClient(url, key, { auth: { persistSession: false } });

const { data: profile, error } = await svc.from("profiles").select("id, email, status").ilike("email", email).maybeSingle();
if (error) {
  console.error("Erro ao procurar o perfil:", error.message);
  process.exit(1);
}
if (!profile) {
  console.error(`Nenhuma conta com o e-mail ${email}. Registe-se primeiro em /registar.`);
  process.exit(1);
}

const { data: authUser } = await svc.auth.admin.getUserById(profile.id);
if (!authUser?.user?.email_confirmed_at) {
  console.error("Confirme o e-mail desta conta antes de a promover.");
  process.exit(1);
}

const { error: roleError } = await svc.from("roles").upsert({ user_id: profile.id, role: "super_admin", granted_by: "bootstrap-script" });
if (roleError) {
  console.error("Não foi possível atribuir o papel:", roleError.message);
  process.exit(1);
}
await svc.rpc("write_audit", {
  p_actor: profile.id,
  p_action: "role.bootstrap_super_admin",
  p_target_type: "user",
  p_target_id: profile.id,
  p_reason: "Provisionamento inicial",
  p_details: {},
});
console.log(`✔ ${email} é agora super_admin. No primeiro acesso a /admin será pedida a ativação da verificação em dois passos.`);
