import type { Metadata } from "next";
import { LegalPage } from "@/components/site/LegalPage";
import { getSettings } from "@/lib/settings";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Política de privacidade" };

export default async function PrivacyPage() {
  const s = await getSettings();
  return (
    <LegalPage title="Política de privacidade" updated={formatDate(s.legal.privacy_updated_at)}>
      <h2>Dados que tratamos</h2>
      <ul>
        <li>Conta: nome, e-mail e palavra-passe (guardada apenas em formato cifrado pelo serviço de autenticação).</li>
        <li>Assinatura e pagamentos: plano, datas, referências AUREA, identificadores de transação Multicaixa Express e estado dos pedidos.</li>
        <li>Utilização: favoritos, histórico e posição de reprodução, preferências de categorias.</li>
        <li>Suporte: mensagens enviadas através do formulário.</li>
        <li>Técnicos: cookies de sessão estritamente necessários e registos de segurança.</li>
      </ul>
      <h2>Finalidades</h2>
      <p>Prestar o serviço, gerir assinaturas e pagamentos, prevenir fraude e abuso, responder a pedidos de suporte e cumprir obrigações legais. Comunicações de novidades e estatísticas de utilização só com o seu consentimento, que pode retirar a qualquer momento nas definições da conta.</p>
      <h2>Partilha</h2>
      <p>Utilizamos prestadores de serviços para alojamento (Vercel), base de dados e autenticação (Supabase) e, quando configurado, envio de e-mail. Ao reproduzir um conteúdo, o YouTube (Google) recebe dados técnicos de acordo com a sua própria política de privacidade; utilizamos o modo de privacidade reforçada do YouTube.</p>
      <h2>Conservação</h2>
      <p>Os dados da conta são conservados enquanto a conta estiver ativa. Ao encerrar a conta, eliminamos o perfil, favoritos, histórico e preferências. Os registos de pagamento são conservados pelo prazo legal aplicável, sem ligação ao perfil.</p>
      <h2>Os seus direitos</h2>
      <p>Pode aceder, corrigir, exportar e eliminar os seus dados nas definições da conta, bem como contactar-nos para exercer outros direitos previstos na legislação aplicável.</p>
      <h2>Segurança</h2>
      <p>Aplicamos medidas técnicas e organizativas adequadas (cifragem em trânsito, controlo de acessos, registos de auditoria). Nenhum sistema é totalmente imune a incidentes, pelo que não garantimos segurança absoluta.</p>
      <h2>Contacto</h2>
      <p>{s.legal.company_name ?? "Responsável pelo tratamento: titular da plataforma AUREA"}{s.support.email ? ` · ${s.support.email}` : ""}</p>
    </LegalPage>
  );
}
