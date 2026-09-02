import { LegalPage } from "@/components/legal-page";

export default function TermsPage() {
  return <LegalPage title="Termos de Uso" updatedAt="25 de agosto de 2026">
    <p>Estes termos são uma minuta técnica para homologação. Razão social, CNPJ, suporte, cobrança, SLA, responsabilidade e foro deverão ser revisados juridicamente antes da oferta comercial.</p>
    <h2>Uso do serviço</h2><p>A empresa cliente é responsável por seus usuários, catálogo, dados fiscais, base legal, autorizações, qualidade das mensagens e conferência dos pedidos antes do faturamento.</p>
    <h2>WhatsApp e serviços externos</h2><p>O uso depende das políticas da Meta e do WhatsApp. Contas, números ou mensagens podem sofrer limitações por decisão desses provedores. O cliente não deve utilizar o serviço para spam, fraude, conteúdo ilícito ou contato sem autorização.</p>
    <h2>Inteligência artificial</h2><p>A extração automática pode conter erros. Todo pedido permanece em conferência humana até aprovação. O Bridge ERP não deve emitir NF-e automaticamente com base exclusiva na interpretação da IA.</p>
    <h2>Segurança</h2><p>É proibido tentar contornar autenticação, acessar outra empresa, explorar vulnerabilidades, inserir código malicioso ou comprometer a disponibilidade do serviço.</p>
    <h2>Encerramento</h2><p>O contrato deverá definir exportação, retenção e eliminação de dados, respeitando obrigações legais e fiscais aplicáveis.</p>
  </LegalPage>;
}
