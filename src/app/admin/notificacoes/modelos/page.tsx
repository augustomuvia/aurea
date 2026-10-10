import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { getNotificationSettings } from "@/lib/notifications/server";
import { TEMPLATE_KEYS, TEMPLATES } from "@/lib/notifications/templates";
import { Badge, PageHeader } from "@/components/ui/Glass";
import { Table, td } from "@/components/admin/Table";
import { formatDateTime } from "@/lib/format";
import { NotificationTabs } from "../Tabs";

export const metadata = { title: "Modelos de e-mail" };

export default async function TemplatesList() {
  await requireSuperAdmin();
  const svc = createServiceClient();
  const [{ data }, s] = await Promise.all([svc.from("email_templates").select("key, subject, updated_at"), getNotificationSettings(svc)]);
  const custom = new Map((data ?? []).map((t) => [t.key, t]));
  return (
    <>
      <PageHeader eyebrow="Notificações" title="Modelos de e-mail">
        Edite o assunto e o texto sem alterar o código. Os dados do pedido, as datas e as ligações são inseridos automaticamente.
      </PageHeader>
      <NotificationTabs current="/admin/notificacoes/modelos" />
      <Table head={["Modelo", "Destinatário", "Assunto", "Estado", "Personalizado"]}>
        {TEMPLATE_KEYS.map((k) => {
          const t = TEMPLATES[k];
          const c = custom.get(k);
          return (
            <tr key={k} className="hover:bg-white/[0.02]">
              <td className={td}>
                <Link href={`/admin/notificacoes/modelos/${k}`} className="font-medium text-gold-light hover:underline">{t.name}</Link>
                <p className="mt-0.5 max-w-xs text-xs text-mute">{t.trigger}</p>
              </td>
              <td className={td}>{t.audience === "admin" ? "Administração" : "Cliente"}</td>
              <td className={`${td} max-w-xs truncate text-paper/80`}>{c?.subject ?? t.defaults.subject}</td>
              <td className={td}>{s.emails[t.flag] === false ? <Badge tone="warn">Desativado</Badge> : <Badge tone="ok">Ativo</Badge>}</td>
              <td className={`${td} text-mute`}>{c ? formatDateTime(c.updated_at) : "Original"}</td>
            </tr>
          );
        })}
      </Table>
    </>
  );
}
