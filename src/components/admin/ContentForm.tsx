"use client";
import { useActionState, useState } from "react";
import { saveContentAction } from "@/app/admin/actions";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormMessage } from "@/components/ui/FormMessage";
import { parseYouTubeUrl, youtubeThumbnail } from "@/lib/youtube";
import { USE_LABEL } from "@/lib/format";

export interface ContentFormValues {
  id?: string;
  title: string;
  slug: string;
  description: string;
  youtubeUrl: string;
  declaredFrequencyHz: number | null;
  durationSeconds: number | null;
  coverUrl: string;
  categoryIds: string[];
  recommendedUse: string[];
  tags: string[];
  isPremium: boolean;
  isBinaural: boolean;
  isFeatured: boolean;
  featuredOrder: number;
  status: string;
}

export function ContentForm({ values, categories }: { values: ContentFormValues; categories: { id: string; name: string }[] }) {
  const [state, action] = useActionState(saveContentAction, null);
  const [url, setUrl] = useState(values.youtubeUrl);
  const preview = parseYouTubeUrl(url);
  const fe = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={action} className="grid gap-5 lg:grid-cols-[1.4fr_1fr]" noValidate>
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <div className="glass space-y-5 p-6">
        <FormMessage state={state} />
        <Field label="URL do YouTube" name="youtubeUrl" error={fe?.youtubeUrl} hint={url && !preview.ok ? preview.error : "Formatos aceites: youtube.com/watch, youtu.be, /embed, /shorts, /live."}>
          <Input name="youtubeUrl" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" required error={fe?.youtubeUrl} />
        </Field>
        <Field label="Título" name="title" error={fe?.title}>
          <Input name="title" defaultValue={values.title} maxLength={140} required error={fe?.title} />
        </Field>
        <Field label="Identificador no URL (slug)" name="slug" error={fe?.slug} hint="Opcional. Gerado a partir do título.">
          <Input name="slug" defaultValue={values.slug} maxLength={90} pattern="[a-z0-9-]+" error={fe?.slug} />
        </Field>
        <Field label="Descrição" name="description" error={fe?.description} hint="Sem alegações médicas ou terapêuticas.">
          <Textarea name="description" defaultValue={values.description} rows={4} maxLength={2000} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Frequência declarada (Hz)" name="declaredFrequencyHz" error={fe?.declaredFrequencyHz}>
            <Input name="declaredFrequencyHz" type="number" step="0.01" min="0" defaultValue={values.declaredFrequencyHz ?? ""} />
          </Field>
          <Field label="Duração (minutos)" name="durationMinutes" error={fe?.durationSeconds}>
            <Input name="durationMinutes" type="number" step="0.5" min="0" defaultValue={values.durationSeconds ? Math.round((values.durationSeconds / 60) * 10) / 10 : ""} />
          </Field>
        </div>
        <Field label="Imagem de capa (URL https, opcional)" name="coverUrl" error={fe?.coverUrl} hint="Sem capa, é usada a miniatura do YouTube.">
          <Input name="coverUrl" type="url" defaultValue={values.coverUrl} />
        </Field>
        <Field label="Etiquetas (separadas por vírgulas)" name="tags">
          <Input name="tags" defaultValue={values.tags.join(", ")} placeholder="chuva, piano, 432hz" />
        </Field>
      </div>

      <div className="space-y-5">
        <div className="glass overflow-hidden">
          {preview.ok ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={values.coverUrl || youtubeThumbnail(preview.videoId)} alt="Pré-visualização da capa" className="aspect-video w-full object-cover" />
          ) : (
            <div className="grid aspect-video place-items-center text-sm text-mute">Pré-visualização</div>
          )}
        </div>
        <div className="glass space-y-5 p-6">
          <Field label="Estado" name="status">
            <Select name="status" defaultValue={values.status}>
              <option value="draft">Rascunho</option>
              <option value="published">Publicado</option>
              <option value="unpublished">Despublicado</option>
              <option value="removed">Removido</option>
            </Select>
          </Field>
          <fieldset>
            <legend className="mb-2 text-[0.8rem] font-medium text-paper/70">Categorias</legend>
            <div className="grid grid-cols-2 gap-2">
              {categories.map((c) => (
                <Checkbox key={c.id} name="categoryIds" value={c.id} defaultChecked={values.categoryIds.includes(c.id)} label={c.name} />
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-[0.8rem] font-medium text-paper/70">Utilização recomendada</legend>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(USE_LABEL).map(([v, l]) => (
                <Checkbox key={v} name="recommendedUse" value={v} defaultChecked={values.recommendedUse.includes(v)} label={l} />
              ))}
            </div>
          </fieldset>
          <div className="space-y-3 border-t border-white/[0.07] pt-4">
            <Checkbox name="isPremium" defaultChecked={values.isPremium} label="Premium (exige assinatura ativa)" />
            <Checkbox name="isBinaural" defaultChecked={values.isBinaural} label="Experiência binaural" />
            <Checkbox name="isFeatured" defaultChecked={values.isFeatured} label="Destaque (Seleção AUREA)" />
            <Field label="Ordem no destaque" name="featuredOrder">
              <Input name="featuredOrder" type="number" min="0" max="999" defaultValue={values.featuredOrder} />
            </Field>
          </div>
          <SubmitButton className="w-full" pendingLabel="A verificar e guardar…">
            Guardar conteúdo
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}
