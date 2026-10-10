import Link from "next/link";
import { ExternalLink, Eye, ImagePlus, Trash2 } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { formatKz } from "@/lib/pricing";
import { formatDateTime } from "@/lib/format";
import { checkCheckoutUrl, EBOOK_SECTIONS, SECTION_LABEL, sellableProblems } from "@/lib/ebook/config";
import { ebookMediaUrl, getEbookRow } from "@/lib/ebook/server";
import { Badge, PageHeader } from "@/components/ui/Glass";
import { ActionForm } from "@/components/admin/ActionForm";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { buttonClass } from "@/components/ui/Button";
import {
  discardDraftAction,
  publishEbookAction,
  removeEbookMediaAction,
  resetEbookAction,
  saveEbookDraftAction,
  setEbookEnabledAction,
  uploadEbookMediaAction,
} from "./actions";

export const metadata = { title: "E-book" };

function Card({ title, description, children, id }: { title: string; description?: React.ReactNode; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="glass p-6">
      <h2 className="font-serif text-2xl text-paper">{title}</h2>
      {description && <div className="mt-1 text-sm text-mute">{description}</div>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4 border-t border-white/[0.07] pt-6 first:border-t-0 first:pt-0">
      <legend className="mb-1 text-[0.7rem] uppercase tracking-[0.16em] text-gold/90">{title}</legend>
      {children}
    </fieldset>
  );
}

export default async function AdminEbook({ searchParams }: { searchParams: Promise<{ eliminado?: string }> }) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const row = await getEbookRow();
  const d = row.draft;
  const hosts = serverEnv.ebookCheckoutHosts;
  const draftProblems = sellableProblems(d, hosts);
  const liveProblems = row.published ? sellableProblems(row.published, hosts) : ["Ainda não publicada."];
  const live = row.enabled && liveProblems.length === 0;
  const unpublishedChanges = row.exists && JSON.stringify(d) !== JSON.stringify(row.published);
  const checkoutHost = d.checkoutUrl ? checkCheckoutUrl(d.checkoutUrl, hosts) : null;
  const benefits = [...d.orientacao.benefits, ...Array.from({ length: Math.max(0, 4 - d.orientacao.benefits.length) }, () => ({ title: "", text: "" }))].slice(0, 4);
  const faq = [...d.faq, ...Array.from({ length: Math.min(2, 12 - d.faq.length) }, () => ({ q: "", a: "" }))];

  return (
    <>
      <PageHeader
        eyebrow="Produto digital"
        title="E-book · AUREA Guide"
        action={
          <div className="flex flex-wrap gap-2">
            <Badge tone={live ? "ok" : "neutral"}>{live ? "Página ativa" : "Página desativada"}</Badge>
            {unpublishedChanges && <Badge tone="warn">Alterações por publicar</Badge>}
          </div>
        }
      >
        Página de venda privada em <code className="text-paper/80">/ebook</code>: não aparece em menus, rodapés nem motores de pesquisa. O pagamento é feito no checkout externo da Kursinha.
      </PageHeader>

      {sp.eliminado && <p className="glass mb-5 p-4 text-sm text-paper/80">A configuração foi eliminada. A página /ebook está desativada e o formulário mostra os textos por omissão.</p>}

      <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <Card
          title="Publicação"
          description={
            <>
              O público vê apenas a <strong className="text-paper/80">versão publicada</strong>, e só quando a página está ativa. Guarde o rascunho, pré-visualize e depois publique.
            </>
          }
        >
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-[0.7rem] uppercase tracking-[0.14em] text-mute">Estado</dt>
              <dd className="mt-1 text-paper/90">{live ? "Ativa" : row.enabled ? "Ativa, mas bloqueada" : "Desativada"}</dd>
            </div>
            <div>
              <dt className="text-[0.7rem] uppercase tracking-[0.14em] text-mute">Publicada em</dt>
              <dd className="mt-1 text-paper/90">{formatDateTime(row.publishedAt)}</dd>
            </div>
            <div>
              <dt className="text-[0.7rem] uppercase tracking-[0.14em] text-mute">Preço publicado</dt>
              <dd className="mt-1 tabular-nums text-paper/90">{row.published ? formatKz(row.published.priceMinor) : "—"}</dd>
            </div>
            <div>
              <dt className="text-[0.7rem] uppercase tracking-[0.14em] text-mute">Checkout publicado</dt>
              <dd className="mt-1 break-all text-paper/90">{row.published?.checkoutUrl ? new URL(row.published.checkoutUrl).hostname : "—"}</dd>
            </div>
          </dl>
          {row.enabled && liveProblems.length > 0 && <p className="mt-4 text-sm text-danger">A página está bloqueada: {liveProblems.join(" ")}</p>}
          {draftProblems.length > 0 && <p className="mt-4 text-sm text-amber-200">Para publicar falta: {draftProblems.join(" ")}</p>}

          <div className="mt-6 flex flex-wrap gap-2">
            <a href="/ebook/pre-visualizar" target="_blank" rel="noopener" className={buttonClass("glass", "md")}>
              <Eye className="h-4 w-4" /> Pré-visualizar rascunho
            </a>
            {row.published && (
              <a href="/ebook/pre-visualizar?versao=publicada" target="_blank" rel="noopener" className={buttonClass("ghost", "md")}>
                Ver versão publicada
              </a>
            )}
            {live && (
              <a href="/ebook" target="_blank" rel="noopener" className={buttonClass("ghost", "md")}>
                <ExternalLink className="h-4 w-4" /> Abrir /ebook
              </a>
            )}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <ActionForm action={publishEbookAction} className="space-y-3">
              <SubmitButton disabled={!row.exists || draftProblems.length > 0} pendingLabel="A publicar…" className="w-full">
                Publicar rascunho
              </SubmitButton>
            </ActionForm>
            <ActionForm action={setEbookEnabledAction} className="space-y-3">
              <input type="hidden" name="enable" value={row.enabled ? "0" : "1"} />
              <SubmitButton variant={row.enabled ? "danger" : "glass"} disabled={!row.enabled && !row.published} pendingLabel="A atualizar…" className="w-full">
                {row.enabled ? "Desativar página" : "Ativar página"}
              </SubmitButton>
            </ActionForm>
          </div>
          {unpublishedChanges && row.published && (
            <ActionForm action={discardDraftAction} className="mt-3">
              <button type="submit" className="text-xs text-mute underline-offset-4 hover:text-paper hover:underline">Descartar alterações do rascunho</button>
            </ActionForm>
          )}
        </Card>

        <Card title="Imagens" description="Capa e pré-visualizações reais do PDF (PNG, JPG ou WebP, até 3 MB). Sem imagens, a página usa a capa gerada e páginas ilustrativas genéricas.">
          <div className="space-y-6">
            <div>
              <p className="text-sm text-paper/80">Capa</p>
              <div className="mt-3 flex items-start gap-4">
                {d.media.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element -- imagem do Storage
                  <img src={ebookMediaUrl(d.media.cover) ?? ""} alt="Capa carregada" className="h-28 w-20 rounded border border-white/10 object-cover" />
                ) : (
                  <div className="grid h-28 w-20 place-items-center rounded border border-dashed border-white/15 text-[0.65rem] text-mute">Capa gerada</div>
                )}
                <div className="flex-1 space-y-2">
                  <ActionForm action={uploadEbookMediaAction} className="space-y-2">
                    <input type="hidden" name="kind" value="cover" />
                    <input type="file" name="file" accept="image/png,image/jpeg,image/webp" required className="block w-full text-xs text-mute file:mr-3 file:rounded-full file:border-0 file:bg-white/[0.08] file:px-3 file:py-1.5 file:text-paper" />
                    <SubmitButton variant="glass" size="sm" pendingLabel="A carregar…">
                      <ImagePlus className="h-4 w-4" /> {d.media.cover ? "Substituir capa" : "Carregar capa"}
                    </SubmitButton>
                  </ActionForm>
                  {d.media.cover && (
                    <ActionForm action={removeEbookMediaAction}>
                      <input type="hidden" name="path" value={d.media.cover} />
                      <button type="submit" className="text-xs text-mute underline-offset-4 hover:text-danger hover:underline">Usar a capa gerada</button>
                    </ActionForm>
                  )}
                </div>
              </div>
            </div>
            <div className="border-t border-white/[0.07] pt-5">
              <p className="text-sm text-paper/80">Pré-visualizações ({d.media.previews.length}/6)</p>
              <p className="mt-1 text-xs text-mute">Não mostre o nome, o endereço nem capturas identificáveis da plataforma revelada no guia.</p>
              {d.media.previews.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-3">
                  {d.media.previews.map((p) => (
                    <li key={p} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element -- imagem do Storage */}
                      <img src={ebookMediaUrl(p) ?? ""} alt="" className="h-24 w-[4.5rem] rounded border border-white/10 object-cover" />
                      <ActionForm action={removeEbookMediaAction} className="absolute -right-2 -top-2">
                        <input type="hidden" name="path" value={p} />
                        <button type="submit" aria-label="Remover pré-visualização" className="grid h-7 w-7 place-items-center rounded-full border border-white/15 bg-ink text-mute hover:text-danger">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </ActionForm>
                    </li>
                  ))}
                </ul>
              )}
              {d.media.previews.length < 6 && (
                <ActionForm action={uploadEbookMediaAction} className="mt-3 space-y-2">
                  <input type="hidden" name="kind" value="previews" />
                  <input type="file" name="file" accept="image/png,image/jpeg,image/webp" required className="block w-full text-xs text-mute file:mr-3 file:rounded-full file:border-0 file:bg-white/[0.08] file:px-3 file:py-1.5 file:text-paper" />
                  <SubmitButton variant="glass" size="sm" pendingLabel="A carregar…">
                    <ImagePlus className="h-4 w-4" /> Adicionar pré-visualização
                  </SubmitButton>
                </ActionForm>
              )}
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-5">
        <Card id="conteudo-ebook" title="Preço, checkout e textos" description="Tudo o que está aqui fica no rascunho até carregar em «Publicar rascunho».">
          <ActionForm action={saveEbookDraftAction} className="space-y-8">
            <Group title="Venda">
              <div className="grid gap-4 sm:grid-cols-[0.5fr_1.5fr]">
                <Field label="Preço (Kz)" name="price" hint={`Atual: ${formatKz(d.priceMinor)}`}>
                  <Input name="price" inputMode="numeric" defaultValue={String(d.priceMinor / 100)} required />
                </Field>
                <Field
                  label="URL de checkout da Kursinha"
                  name="checkoutUrl"
                  hint={
                    checkoutHost?.ok
                      ? `Domínio: ${checkoutHost.host}`
                      : hosts.length
                        ? `Domínios autorizados: ${hosts.join(", ")}`
                        : "Apenas https://. Cole o link real do produto na Kursinha."
                  }
                >
                  <Input name="checkoutUrl" type="url" inputMode="url" defaultValue={d.checkoutUrl} placeholder="https://…" autoComplete="off" />
                </Field>
              </div>
            </Group>

            <Group title="Secções publicadas">
              <p className="text-xs text-mute">A abertura e a oferta aparecem sempre.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {EBOOK_SECTIONS.map((s) => (
                  <Checkbox key={s} name={`sec_${s}`} defaultChecked={d.sections[s]} label={SECTION_LABEL[s]} />
                ))}
              </div>
            </Group>

            <Group title="Abertura">
              <Field label="Linha editorial" name="hero_eyebrow"><Input name="hero_eyebrow" defaultValue={d.hero.eyebrow} maxLength={80} /></Field>
              <Field label="Título" name="hero_title"><Textarea name="hero_title" rows={2} defaultValue={d.hero.title} maxLength={160} /></Field>
              <Field label="Subtítulo" name="hero_subtitle"><Textarea name="hero_subtitle" rows={3} defaultValue={d.hero.subtitle} maxLength={400} /></Field>
              <Field label="Botão" name="hero_cta"><Input name="hero_cta" defaultValue={d.hero.cta} maxLength={40} /></Field>
            </Group>

            <Group title="Saber onde começar">
              <Field label="Título" name="ori_title"><Input name="ori_title" defaultValue={d.orientacao.title} maxLength={120} /></Field>
              <Field label="Texto (linha em branco separa parágrafos)" name="ori_body"><Textarea name="ori_body" rows={6} defaultValue={d.orientacao.body} maxLength={1200} /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                {benefits.map((b, i) => (
                  <div key={i} className="space-y-2 rounded-xl border border-white/[0.07] p-4">
                    <Field label={`Benefício ${i + 1}${i >= 3 ? " (opcional)" : ""}`} name={`benefit_${i}_title`}>
                      <Input name={`benefit_${i}_title`} defaultValue={b.title} maxLength={40} placeholder="Título" />
                    </Field>
                    <Textarea name={`benefit_${i}_text`} aria-label={`Texto do benefício ${i + 1}`} rows={3} defaultValue={b.text} maxLength={240} />
                  </div>
                ))}
              </div>
              <p className="text-xs text-mute">Deixe título e texto vazios para remover um benefício.</p>
            </Group>

            <Group title="O que recebes">
              <Field label="Título" name="con_title"><Input name="con_title" defaultValue={d.conteudo.title} maxLength={120} /></Field>
              <Field label="Conteúdo do guia (um item por linha)" name="con_items" hint="Indique apenas o que o PDF contém de facto. Não escreva o nome nem o endereço da plataforma.">
                <Textarea name="con_items" rows={8} defaultValue={d.conteudo.items.join("\n")} />
              </Field>
              <Field label="Nota por baixo das imagens" name="con_note"><Input name="con_note" defaultValue={d.conteudo.note} maxLength={300} /></Field>
            </Group>

            <Group title="A experiência de descoberta">
              <Field label="Título" name="exp_title"><Input name="exp_title" defaultValue={d.experiencia.title} maxLength={120} /></Field>
              <Field label="Texto" name="exp_body"><Textarea name="exp_body" rows={6} defaultValue={d.experiencia.body} maxLength={1200} /></Field>
            </Group>

            <Group title="Oferta">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Título" name="off_title"><Input name="off_title" defaultValue={d.oferta.title} maxLength={120} /></Field>
                <Field label="Nome do produto" name="off_productName"><Input name="off_productName" defaultValue={d.oferta.productName} maxLength={60} /></Field>
                <Field label="Etiqueta" name="off_label"><Input name="off_label" defaultValue={d.oferta.label} maxLength={40} /></Field>
                <Field label="Botão" name="off_cta"><Input name="off_cta" defaultValue={d.oferta.cta} maxLength={40} /></Field>
              </div>
              <Field label="Descrição" name="off_description"><Textarea name="off_description" rows={3} defaultValue={d.oferta.description} maxLength={400} /></Field>
              <Field label="Microtexto (entrega)" name="off_microtext"><Textarea name="off_microtext" rows={3} defaultValue={d.oferta.microtext} maxLength={400} /></Field>
              <Field label="Aviso sobre o checkout externo" name="off_checkoutNotice"><Textarea name="off_checkoutNotice" rows={2} defaultValue={d.oferta.checkoutNotice} maxLength={300} /></Field>
            </Group>

            <Group title="Perguntas frequentes">
              <div className="space-y-3">
                {faq.map((f, i) => (
                  <div key={i} className="space-y-2 rounded-xl border border-white/[0.07] p-4">
                    <Field label={`Pergunta ${i + 1}`} name={`faq_${i}_q`}>
                      <Input name={`faq_${i}_q`} defaultValue={f.q} maxLength={160} placeholder={i >= d.faq.length ? "Nova pergunta (opcional)" : undefined} />
                    </Field>
                    <Textarea name={`faq_${i}_a`} aria-label={`Resposta ${i + 1}`} rows={2} defaultValue={f.a} maxLength={800} placeholder="Resposta" />
                  </div>
                ))}
              </div>
              <p className="text-xs text-mute">Deixe pergunta e resposta vazias para remover. Guarde para obter mais campos (máximo 12).</p>
            </Group>

            <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-full border border-white/10 bg-ink/85 p-2 pl-5 backdrop-blur">
              <span className="text-xs text-mute">As alterações ficam no rascunho.</span>
              <SubmitButton pendingLabel="A guardar…" className="ml-auto">Guardar rascunho</SubmitButton>
            </div>
          </ActionForm>
        </Card>
      </div>

      <div className="mt-5">
        <Card title="Eliminar configuração" description="Apaga textos, preço, URL de checkout e imagens desta página. A página fica desativada e /ebook passa a responder «não encontrado».">
          <ActionForm action={resetEbookAction} className="flex flex-wrap items-end gap-3">
            <Field label='Escreva "ELIMINAR"' name="confirm">
              <Input name="confirm" autoComplete="off" className="w-48" />
            </Field>
            <SubmitButton variant="danger" pendingLabel="A eliminar…" disabled={!row.exists}>Eliminar configuração</SubmitButton>
          </ActionForm>
        </Card>
      </div>
      <p className="mt-6 text-xs text-mute">
        Ligações e <code>noindex</code> mantêm a página fora da navegação pública e dos motores de pesquisa, mas quem tiver o endereço consegue abri-la enquanto estiver ativa.{" "}
        <Link href="/admin/auditoria" className="underline underline-offset-4 hover:text-paper">Ver auditoria</Link>
      </p>
    </>
  );
}
