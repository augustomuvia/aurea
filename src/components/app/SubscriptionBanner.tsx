import { Sparkles } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import type { SubscriptionView } from "@/lib/subscription";

export function SubscriptionBanner({ view }: { view: SubscriptionView }) {
  if (view.hasAccess) return null;
  const pending = view.effective === "pending_payment";
  return (
    <div className="glass glass-sheen mb-10 flex flex-col gap-4 p-6 animate-rise sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-gold/30 bg-gold/[0.08]">
          <Sparkles className="h-5 w-5 text-gold" strokeWidth={1.5} />
        </div>
        <div>
          <p className="font-medium text-paper">{pending ? "O seu pagamento está a ser verificado" : "Desbloqueie a biblioteca completa"}</p>
          <p className="mt-1 text-sm text-mute">
            {pending
              ? "Assim que o pagamento for confirmado, o acesso premium é ativado automaticamente."
              : "Os conteúdos abertos estão disponíveis. Com um plano, tem acesso a toda a seleção AUREA."}
          </p>
        </div>
      </div>
      <ButtonLink href={pending ? "/app/pagamentos" : "/planos"} variant={pending ? "glass" : "gold"} className="shrink-0">
        {pending ? "Ver estado" : "Ver planos"}
      </ButtonLink>
    </div>
  );
}
