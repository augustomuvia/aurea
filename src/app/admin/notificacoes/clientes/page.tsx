import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { getIntegration } from "@/lib/notifications/server";
import { Badge, PageHeader } from "@/components/ui/Glass";
import { ActionForm } from "@/components/admin/ActionForm";
import { Field, Input } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { NotificationTabs } from "../Tabs";
import { enqueueBackfillAction } from "../actions";

export const metadata = { title: "Enviar aos clientes atuais" };

type Group = { count: number; enabled: boolean; sample: string[] };
type Preview = { ok: true; test_mode: boolean; welcome: Group; payment: Group } | { ok: false; error: string };

/** Mostra só o início do endereço: suficiente para reconhecer, sem expor a lista. */
function maskEmail(e: string) {
  const [local, domain] = e.split("@");
  if (!domain) return "•••";
  return `${local.slice(0, Math.min(2, Math.max(1, local.length - 1)))}•••@${domain}`;
}

const KINDS = [
  {
    kind: "welcome" as const,
    title: "Boas-vindas",
    template: "welcome",
    description: "Para cada conta com e-mail confirmado que nunca recebeu o e-mail de boas-vindas. Contas suspensas, por confirmar e de administradores ficam de fora.",
    flagLabel: "Boas-vindas",
  },
  {
    kind: "payment" as const,
    title: "Pagamento confirmado com recibo",
    template: "payment_receipt",
    description:
      "Um e-mail por pagamento confirmado cujo cliente ainda não recebeu a confirmação, com o recibo em PDF em anexo. Pedidos pendentes, rejeitados ou revertidos ficam de fora.",
    flagLabel: "Plano ativado (cliente)",
  },
];

export default async function BackfillPage() {
  const admin = await requireSuperAdmin();
  const svc = createServiceClient();
  const [{ status }, { data, error }] = await Promise.all([getIntegration(svc), svc.rpc("notif_backfill_preview", { p_actor: admin.id })]);
  const preview = (error ? { ok: false, error: "migration" } : data) as Preview | null;
  const active = status.code === "active";

  return (
    <>
      <PageHeader eyebrow="Notificações" title="Enviar aos clientes atuais">
        Envio único para quem já estava na plataforma antes dos e-mails automáticos. Os novos clientes recebem estes e-mails automaticamente.
      </PageHeader>
      <NotificationTabs current="/admin/notificacoes/clientes" />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Badge tone={active ? "ok" : status.code === "pending_verification" ? "warn" : "neutral"}>{status.label}</Badge>
        {preview?.ok && preview.test_mode && <Badge tone="warn">Modo de teste ativo</Badge>}
      </div>

      {!active && (
        <p className="mb-5 rounded-xl border border-amber-300/25 bg-amber-300/[0.06] px-4 py-3 text-sm text-amber-100">
          A integração não está ativa. O envio aos clientes atuais só é possível depois de validar a integração em{" "}
          <Link href="/admin/notificacoes" className="underline">Estado e configurações</Link>.
        </p>
      )}

      {!preview?.ok ? (
        <p className="glass p-6 text-sm text-mute">
          Não foi possível calcular os destinatários. Execute no Supabase a migração <code className="text-paper">20261010000500_backfill_receipts.sql</code> (ver docs/NOTIFICACOES.md).
        </p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {KINDS.map((k) => {
            const g = preview[k.kind];
            const blocked = !active ? "Integração inativa" : preview.test_mode ? "Desative o modo de teste" : !g.enabled ? `Ative “${k.flagLabel}” em Configurações` : null;
            return (
              <section key={k.kind} className="glass p-6">
                <h2 className="font-serif text-2xl text-paper">{k.title}</h2>
                <p className="mt-1 text-sm text-mute">{k.description}</p>
                <div className="mt-5 flex items-baseline gap-2">
                  <span className="font-serif text-4xl tabular-nums text-paper">{g.count}</span>
                  <span className="text-sm text-mute">{g.count === 1 ? "destinatário" : "destinatários"}</span>
                </div>
                {g.sample.length > 0 && (
                  <p className="mt-2 break-all text-xs text-mute">
                    Por exemplo: {g.sample.map(maskEmail).join(", ")}
                    {g.count > g.sample.length ? `, e mais ${g.count - g.sample.length}` : ""}
                  </p>
                )}
                <p className="mt-2 text-xs text-mute">
                  Modelo: <Link href={`/admin/notificacoes/modelos/${k.template}`} className="text-gold-light hover:underline">ver e enviar teste</Link>
                </p>
                {g.count > 0 ? (
                  <ActionForm action={enqueueBackfillAction} className="mt-5 space-y-4 border-t border-white/[0.07] pt-5">
                    <input type="hidden" name="kind" value={k.kind} />
                    <Field label={`Para confirmar, escreva ${g.count}`} name={`confirm-${k.kind}`} hint={blocked ?? "Os e-mails entram na fila e saem em lotes de 50. Ninguém recebe o mesmo e-mail duas vezes."}>
                      <Input name="confirm" id={`confirm-${k.kind}`} inputMode="numeric" autoComplete="off" placeholder={String(g.count)} disabled={!!blocked} />
                    </Field>
                    <SubmitButton variant="glass" pendingLabel="A colocar na fila…" disabled={!!blocked}>
                      Enviar a {g.count} {g.count === 1 ? "cliente" : "clientes"}
                    </SubmitButton>
                  </ActionForm>
                ) : (
                  <p className="mt-5 border-t border-white/[0.07] pt-5 text-sm text-mute">Nada a enviar: todos já têm este e-mail registado (enviado, na fila ou falhado).</p>
                )}
              </section>
            );
          })}
        </div>
      )}

      <div className="mt-6 space-y-2 text-sm text-mute">
        <p>
          Os e-mails a clientes atuais ficam atrás dos e-mails transacionais na fila: um envio grande nunca atrasa as instruções de um pedido novo. Acompanhe o envio em{" "}
          <Link href="/admin/notificacoes/historico?evento=backfill.welcome" className="text-gold-light hover:underline">Histórico</Link>. Um e-mail falhado pode ser repetido a partir do Histórico.
        </p>
        <p>O Google Workspace limita cada conta a cerca de 2.000 mensagens por dia: se esse limite for atingido, o Google recusa os restantes e a fila tenta de novo mais tarde.</p>
        <p>
          O recibo em PDF é um comprovativo de pagamento emitido pela AUREA, não uma fatura: em Angola, as faturas têm de ser emitidas por software certificado pela AGT.
        </p>
      </div>
    </>
  );
}
