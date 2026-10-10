import { notFound } from "next/navigation";
import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { allowedVars, isTemplateKey, TEMPLATES, VARIABLES } from "@/lib/notifications/templates";
import { getNotificationSettings } from "@/lib/notifications/server";
import { PageHeader } from "@/components/ui/Glass";
import { NotificationTabs } from "../../Tabs";
import { resetTemplateAction } from "../../actions";
import { TemplateEditor } from "./TemplateEditor";

export const metadata = { title: "Editar modelo" };

export default async function EditTemplate({ params }: { params: Promise<{ key: string }> }) {
  const admin = await requireSuperAdmin();
  const { key } = await params;
  if (!isTemplateKey(key)) notFound();
  const def = TEMPLATES[key];
  const svc = createServiceClient();
  const [{ data }, s] = await Promise.all([svc.from("email_templates").select("subject, heading, body, cta_label").eq("key", key).maybeSingle(), getNotificationSettings(svc)]);
  const content = data ?? def.defaults;
  const vars = allowedVars(key).map((v) => ({ name: v, description: VARIABLES[v], required: def.required.includes(v) }));
  const recipients = [...new Set([s.admin_email, admin.email, ...s.test_recipients])];
  return (
    <>
      <PageHeader eyebrow="Modelos de e-mail" title={def.name}>
        {def.trigger}
      </PageHeader>
      <NotificationTabs current="/admin/notificacoes/modelos" />
      <p className="mb-6 text-sm">
        <Link href="/admin/notificacoes/modelos" className="text-paper/60 hover:text-paper">← Todos os modelos</Link>
      </p>
      <TemplateEditor
        templateKey={key}
        initial={content}
        vars={vars}
        details={def.details.map(([label]) => label)}
        recipients={recipients}
        customized={Boolean(data)}
      />
      {data && (
        <form action={resetTemplateAction} className="mt-6">
          <input type="hidden" name="key" value={key} />
          <button className="text-sm text-paper/60 hover:text-paper hover:underline">Repor o texto original</button>
        </form>
      )}
    </>
  );
}
