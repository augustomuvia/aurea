export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <section className="mx-auto max-w-3xl px-4 pb-10 pt-32 sm:px-6">
      <p className="text-[0.72rem] uppercase tracking-[0.24em] text-gold/90">Informação legal</p>
      <h1 className="mt-3 font-serif text-5xl text-paper">{title}</h1>
      <p className="mt-2 text-sm text-mute">Última atualização: {updated}</p>
      <div className="prose-aurea mt-8">{children}</div>
      <p className="mt-12 rounded-xl border border-amber-300/20 bg-amber-300/[0.05] p-4 text-xs leading-relaxed text-amber-100/80">
        Modelo base preparado para revisão. Antes de publicar, deve ser validado por um jurista à luz da legislação angolana aplicável, incluindo a Lei n.º 22/11 (Proteção de Dados Pessoais).
      </p>
    </section>
  );
}
