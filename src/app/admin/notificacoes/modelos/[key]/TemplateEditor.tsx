"use client";
import { startTransition, useActionState, useRef } from "react";
import { FormMessage } from "@/components/ui/FormMessage";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Button } from "@/components/ui/Button";
import type { TemplateContent } from "@/lib/notifications/templates";
import { previewTemplateAction, saveTemplateAction, sendTemplateTestAction, type PreviewResult } from "../../actions";

export function TemplateEditor({
  templateKey,
  initial,
  vars,
  details,
  recipients,
  customized,
}: {
  templateKey: string;
  initial: TemplateContent;
  vars: { name: string; description: string; required: boolean }[];
  details: string[];
  recipients: string[];
  customized: boolean;
}) {
  const [saveState, saveAction] = useActionState(saveTemplateAction, null);
  const [preview, previewAction, previewing] = useActionState<PreviewResult | null, FormData>(previewTemplateAction, null);
  const [testState, testAction] = useActionState(sendTemplateTestAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const fe = saveState && !saveState.ok ? saveState.fieldErrors : preview && !preview.ok ? preview.fieldErrors : undefined;
  const html = preview?.ok ? preview.data?.html : null;

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
      <div className="space-y-5">
        <form ref={formRef} action={saveAction} className="glass space-y-4 p-6">
          <FormMessage state={saveState} />
          <input type="hidden" name="key" value={templateKey} />
          <Field label="Assunto" name="subject" error={fe?.subject}>
            <Input name="subject" defaultValue={initial.subject} maxLength={200} error={fe?.subject} />
          </Field>
          <Field label="Título" name="heading" error={fe?.heading}>
            <Input name="heading" defaultValue={initial.heading} maxLength={160} error={fe?.heading} />
          </Field>
          <Field label="Texto" name="body" error={fe?.body} hint="Deixe uma linha em branco entre parágrafos.">
            <Textarea name="body" defaultValue={initial.body} rows={12} maxLength={6000} error={fe?.body} />
          </Field>
          <Field label="Texto do botão" name="cta_label" error={fe?.cta_label}>
            <Input name="cta_label" defaultValue={initial.cta_label} maxLength={60} error={fe?.cta_label} />
          </Field>
          <div className="flex flex-wrap gap-3">
            <SubmitButton variant="gold" pendingLabel="A guardar…">Guardar modelo</SubmitButton>
            <Button
              type="button"
              variant="glass"
              disabled={previewing}
              onClick={() => {
                const form = formRef.current;
                if (form) startTransition(() => previewAction(new FormData(form)));
              }}
            >
              {previewing ? "A gerar…" : "Pré-visualizar"}
            </Button>
          </div>
          <p className="text-xs text-mute">{customized ? "Este modelo foi personalizado." : "Está a ver o texto original."} As alterações aplicam-se aos próximos envios.</p>
        </form>

        <section className="glass p-6">
          <h3 className="font-medium text-paper">Variáveis disponíveis</h3>
          <p className="mt-1 text-xs text-mute">Variáveis desconhecidas ou de outro modelo são recusadas ao guardar.</p>
          <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            {vars.map((v) => (
              <li key={v.name}>
                <code className="text-gold-light">{`{{${v.name}}}`}</code>
                {v.required && <span className="ml-1 text-xs text-amber-200">obrigatória</span>}
                <span className="block text-xs text-mute">{v.description}</span>
              </li>
            ))}
          </ul>
          {details.length > 0 && <p className="mt-4 text-xs text-mute">Inserido automaticamente num quadro: {details.join(", ")}.</p>}
        </section>

        <form action={testAction} className="glass space-y-4 p-6">
          <h3 className="font-medium text-paper">Envio de teste</h3>
          <FormMessage state={testState} />
          <input type="hidden" name="key" value={templateKey} />
          <Field label="Destinatário autorizado" name="to" hint="Usa o modelo guardado e dados de demonstração. O assunto leva [TESTE].">
            <Select name="to" defaultValue={recipients[0]}>
              {recipients.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </Select>
          </Field>
          <SubmitButton variant="glass" pendingLabel="A enviar…">Enviar teste</SubmitButton>
        </form>
      </div>

      <div className="xl:sticky xl:top-6 xl:self-start">
        <div className="glass overflow-hidden">
          <div className="border-b border-white/[0.07] px-4 py-3 text-sm">
            <p className="text-mute">Pré-visualização com dados de demonstração</p>
            {preview?.ok && <p className="mt-1 font-medium text-paper">{preview.data?.subject}</p>}
            {preview && !preview.ok && <p className="mt-1 text-danger">{preview.error}</p>}
          </div>
          {html ? (
            <iframe title="Pré-visualização do e-mail" sandbox="" srcDoc={html} className="h-[720px] w-full bg-white" />
          ) : (
            <p className="px-4 py-16 text-center text-sm text-mute">Carregue em “Pré-visualizar” para ver o e-mail.</p>
          )}
          {preview?.ok && (
            <details className="border-t border-white/[0.07] px-4 py-3 text-sm">
              <summary className="cursor-pointer text-paper/70">Versão em texto simples</summary>
              <pre className="mt-3 whitespace-pre-wrap text-xs text-paper/70">{preview.data?.text}</pre>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
