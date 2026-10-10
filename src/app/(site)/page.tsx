import Link from "next/link";
import { ArrowRight, Moon, Focus, Waves as WavesIcon, Wind, Leaf, Sparkles, Radio, Headphones, ChevronDown } from "lucide-react";
import { HeroWaves } from "@/components/brand/Waves";
import { ButtonLink } from "@/components/ui/Button";
import { PlansGrid } from "@/components/plans/PlansGrid";
import { ContentCard } from "@/components/catalog/ContentCard";
import { getActivePlans } from "@/lib/plans";
import { listCategories, listContent } from "@/lib/catalog";


const CATEGORY_ICONS: Record<string, typeof Moon> = {
  relaxamento: Wind,
  meditacao: Sparkles,
  concentracao: Focus,
  sono: Moon,
  natureza: Leaf,
  ambientes: WavesIcon,
  frequencias: Radio,
  binaurais: Headphones,
};

const FAQ = [
  {
    q: "O que é a AUREA?",
    a: "Uma biblioteca curada de experiências sonoras para acompanhar momentos de concentração, descanso, meditação e relaxamento, reproduzidas num leitor integrado.",
  },
  {
    q: "As frequências têm efeitos terapêuticos?",
    a: "Não fazemos alegações clínicas. As frequências (como 432 Hz ou 528 Hz) são categorias descritivas declaradas pelos autores dos conteúdos. A AUREA não substitui diagnóstico, tratamento ou aconselhamento médico.",
  },
  {
    q: "Como pago a assinatura?",
    a: "Exclusivamente por Multicaixa Express. Depois de escolher o plano, recebe uma referência AUREA e as instruções de pagamento. A assinatura é ativada assim que o pagamento é confirmado.",
  },
  {
    q: "A assinatura renova automaticamente?",
    a: "Não. Nenhum valor é cobrado sem a sua ação. Antes de terminar o período pode renovar manualmente e o novo período soma-se ao atual.",
  },
  {
    q: "De onde vêm os conteúdos?",
    a: "A biblioteca junta sons originais AUREA e vídeos públicos do YouTube incorporados através do leitor oficial, respeitando as regras da plataforma. Nos vídeos do YouTube podem surgir anúncios, marcas ou avisos do YouTube.",
  },
  {
    q: "Posso ouvir com o ecrã bloqueado?",
    a: "Sim, nos sons AUREA dos planos Trimestral e Anual, que também pode descarregar para ouvir offline. Os vídeos do YouTube precisam de ficar visíveis durante a reprodução, por regra do próprio YouTube.",
  },
];

export default async function HomePage() {
  const [plans, categories, featured] = await Promise.all([getActivePlans(), listCategories(), listContent({ featured: true, limit: 8 })]);

  return (
    <>
      {/* ---------- Hero ---------- */}
      <section className="relative flex min-h-[100svh] items-center justify-center overflow-hidden px-5 pb-16 pt-28">
        <HeroWaves />
        <div className="relative z-10 mx-auto max-w-3xl text-center">
          <p className="animate-rise text-[0.72rem] font-medium uppercase tracking-[0.42em] text-gold/90" style={{ animationDelay: "60ms" }}>
            AUREA
          </p>
          <h1 className="mt-6 animate-rise font-serif text-[clamp(3rem,10vw,6.5rem)] leading-[0.95] tracking-[-0.01em] text-paper" style={{ animationDelay: "140ms" }}>
            Um espaço para <em className="text-gold-gradient not-italic">desacelerar.</em>
          </h1>
          <p className="mx-auto mt-7 max-w-xl animate-rise text-[1.02rem] leading-relaxed text-paper/65 sm:text-lg" style={{ animationDelay: "240ms" }}>
            Descubra experiências sonoras cuidadosamente selecionadas para acompanhar os seus momentos de concentração, descanso, meditação e relaxamento.
          </p>
          <div className="mt-10 flex animate-rise flex-col items-center justify-center gap-3 sm:flex-row" style={{ animationDelay: "340ms" }}>
            <ButtonLink href="/app/biblioteca" size="lg" className="w-full sm:w-auto">
              Explorar biblioteca <ArrowRight className="h-4 w-4" />
            </ButtonLink>
            <ButtonLink href="#planos" variant="glass" size="lg" className="w-full sm:w-auto">
              Conhecer os planos
            </ButtonLink>
          </div>
        </div>
        <a href="#destaques" aria-label="Descer" className="absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 text-paper/40 transition hover:text-paper/80">
          <ChevronDown className="h-5 w-5 animate-bounce motion-reduce:animate-none" />
        </a>
      </section>

      {/* ---------- Destaques ---------- */}
      <section id="destaques" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-20 sm:px-6">
        <SectionTitle eyebrow="Seleção AUREA" title="Experiências em destaque">
          Escolhidas pela textura, pela duração e pela forma como acompanham o seu momento.
        </SectionTitle>
        {featured.length ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">
            {featured.map((item) => (
              <ContentCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <p className="glass px-6 py-10 text-center text-sm text-mute">A primeira seleção está a ser preparada.</p>
        )}
      </section>

      {/* ---------- Categorias ---------- */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <SectionTitle eyebrow="Categorias" title="Para cada estado, um som." />
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {categories.map((c, i) => {
            const Icon = CATEGORY_ICONS[c.slug] ?? WavesIcon;
            return (
              <li key={c.id} className="animate-rise" style={{ animationDelay: `${i * 50}ms` }}>
                <Link href={`/app/categorias/${c.slug}`} className="glass press group flex h-full flex-col justify-between gap-6 p-5 hover:border-gold/30">
                  <Icon className="h-5 w-5 text-gold transition group-hover:scale-110" strokeWidth={1.4} />
                  <div>
                    <p className="font-medium text-paper">{c.name}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-mute">{c.description}</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ---------- Como funciona ---------- */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <SectionTitle eyebrow="Como funciona" title="Três passos. Nada mais." />
        <ol className="grid gap-4 md:grid-cols-3">
          {[
            { t: "Crie a sua conta", d: "Registo simples com e-mail. Explore os conteúdos abertos desde o primeiro minuto." },
            { t: "Escolha o seu plano", d: "Mensal, trimestral ou anual, pago por Multicaixa Express. Sem renovação automática." },
            { t: "Escute com intenção", d: "Guarde favoritos, retome onde parou e construa a sua rotina de escuta." },
          ].map((s, i) => (
            <li key={s.t} className="glass p-7">
              <span className="font-serif text-5xl text-gold/80">0{i + 1}</span>
              <h3 className="mt-6 text-lg font-medium text-paper">{s.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-mute">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------- Benefícios ---------- */}
      <section className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="glass glass-sheen grid gap-10 overflow-hidden p-8 sm:p-12 md:grid-cols-[1fr_1.2fr]">
          <div>
            <p className="text-[0.72rem] uppercase tracking-[0.22em] text-gold/90">Uma rotina de escuta</p>
            <h2 className="mt-3 font-serif text-4xl leading-tight text-paper sm:text-5xl">Pequenos rituais, mais presença.</h2>
            <p className="mt-5 text-sm leading-relaxed text-mute">
              Muitas pessoas usam som ambiente para criar fronteiras entre momentos do dia. A AUREA ajuda a tornar esse hábito simples e bonito. Os efeitos variam de pessoa para pessoa e
              não fazemos promessas médicas.
            </p>
          </div>
          <ul className="grid gap-5 sm:grid-cols-2">
            {[
              { t: "Marcar pausas", d: "Uma faixa curta como sinal para abrandar entre tarefas." },
              { t: "Proteger o foco", d: "Som contínuo e discreto que reduz distrações do ambiente." },
              { t: "Preparar o descanso", d: "Ambientes longos e suaves para o fim do dia." },
              { t: "Acompanhar a prática", d: "Texturas sonoras para meditação e respiração." },
              { t: "Ouvir com o ecrã bloqueado", d: "Nos planos Trimestral e Anual, os sons AUREA continuam com o telemóvel bloqueado ou noutra app, com controlos no ecrã de bloqueio." },
              { t: "Ouvir offline", d: "Nos planos Trimestral e Anual, descarregue os sons AUREA e ouça sem rede nem dados móveis, em casa, na estrada ou em viagem." },
              { t: "Como uma app no telemóvel", d: "Adicione a AUREA ao ecrã principal no iPhone ou Android e abra com um toque, com o nosso logótipo." },
            ].map((b) => (
              <li key={b.t} className="border-l border-gold/30 pl-4">
                <p className="font-medium text-paper">{b.t}</p>
                <p className="mt-1 text-sm leading-relaxed text-mute">{b.d}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------- Planos ---------- */}
      <section id="planos" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-20 sm:px-6">
        <SectionTitle eyebrow="Planos" title="Escolha o seu ritmo." center>
          Preços em kwanzas. Pagamento exclusivo por Multicaixa Express.
        </SectionTitle>
        <PlansGrid plans={plans} />
      </section>

      {/* ---------- FAQ ---------- */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-24 px-4 py-20 sm:px-6">
        <SectionTitle eyebrow="Perguntas frequentes" title="Antes de começar." center />
        <div className="glass divide-y divide-white/[0.07]">
          {FAQ.map((f) => (
            <details key={f.q} className="group px-6 py-5 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[0.98rem] text-paper">
                {f.q}
                <ChevronDown className="h-4 w-4 shrink-0 text-mute transition duration-300 group-open:rotate-180" />
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-mute">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}

function SectionTitle({ eyebrow, title, children, center = false }: { eyebrow: string; title: string; children?: React.ReactNode; center?: boolean }) {
  return (
    <div className={`mb-10 ${center ? "text-center" : ""}`}>
      <p className="text-[0.72rem] font-medium uppercase tracking-[0.24em] text-gold/90">{eyebrow}</p>
      <h2 className="mt-3 font-serif text-4xl leading-[1.05] text-paper sm:text-5xl">{title}</h2>
      {children && <p className={`mt-3 max-w-xl text-[0.95rem] leading-relaxed text-mute ${center ? "mx-auto" : ""}`}>{children}</p>}
    </div>
  );
}
