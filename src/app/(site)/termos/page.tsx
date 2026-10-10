import type { Metadata } from "next";
import { LegalPage } from "@/components/site/LegalPage";
import { getSettings } from "@/lib/settings";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Termos e condições" };

export default async function TermsPage() {
  const s = await getSettings();
  const entity = s.legal.company_name ? `por ${s.legal.company_name}` : "pelo titular da plataforma AUREA";
  return (
    <LegalPage title="Termos e condições" updated={formatDate(s.legal.terms_updated_at)}>
      <h2>1. Objeto</h2>
      <p>Estes termos regulam a utilização da AUREA, plataforma de experiências sonoras para relaxamento, concentração, meditação e descanso, disponibilizada {entity}.</p>
      <h2>2. Natureza do serviço</h2>
      <p>A AUREA é um serviço de bem-estar. Não presta serviços de saúde e não substitui diagnóstico, tratamento ou aconselhamento médico. As frequências indicadas são descrições declaradas pelos autores dos conteúdos e não constituem alegações terapêuticas.</p>
      <p>Conteúdos binaurais devem ser ouvidos com auscultadores e volume moderado. Não utilize conteúdos sonoros relaxantes enquanto conduz ou opera máquinas.</p>
      <h2>3. Conta</h2>
      <ul>
        <li>É responsável pela confidencialidade das suas credenciais.</li>
        <li>Os dados fornecidos devem ser verdadeiros e atualizados.</li>
        <li>Podemos suspender contas em caso de fraude, abuso ou violação destes termos.</li>
      </ul>
      <h2>4. Assinaturas e pagamentos</h2>
      <ul>
        <li>Os planos (mensal, trimestral e anual) são apresentados em kwanzas e pagos exclusivamente por Multicaixa Express.</li>
        <li>O acesso premium é ativado apenas após a confirmação do pagamento e termina automaticamente no fim do período contratado.</li>
        <li>Não há renovação automática nem cobranças recorrentes. A renovação é sempre uma ação do utilizador.</li>
        <li>Pedidos de pagamento não concluídos expiram ao fim de 7 dias.</li>
      </ul>
      <h2>5. Conteúdos de terceiros</h2>
      <p>Os conteúdos são reproduzidos através do leitor oficial do YouTube, sujeitos aos Termos de Serviço do YouTube. Podem ser apresentados anúncios, marcas ou avisos do YouTube, e um conteúdo pode deixar de estar disponível por decisão do respetivo autor.</p>
      <h2>6. Propriedade intelectual</h2>
      <p>A marca AUREA, o design e o software da plataforma são protegidos. Os conteúdos incorporados pertencem aos respetivos titulares.</p>
      <h2>7. Responsabilidade</h2>
      <p>Empenhamo-nos em manter o serviço disponível e seguro, sem garantir funcionamento ininterrupto ou isento de erros.</p>
      <h2>8. Contactos</h2>
      <p>Para qualquer questão, utilize a página de suporte{s.support.email ? ` ou escreva para ${s.support.email}` : ""}.</p>
    </LegalPage>
  );
}
