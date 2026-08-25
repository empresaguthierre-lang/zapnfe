import { LegalPage } from "@/components/legal-page";

export default function DataDeletionPage() {
  return <LegalPage title="Solicitação de Dados e Exclusão" updatedAt="25 de agosto de 2026">
    <p>Este canal será usado para solicitações de acesso, correção, bloqueio, anonimização, portabilidade e exclusão de dados pessoais.</p>
    <h2>Como solicitar</h2><p>Antes da produção, será publicado aqui o formulário e o contato oficial de privacidade. A solicitação deverá informar a relação do titular com a empresa cliente e os dados necessários para confirmação segura da identidade.</p>
    <h2>Verificação</h2><p>Não eliminaremos ou entregaremos dados sem verificar a legitimidade do pedido. Solicitações envolvendo dados controlados por uma empresa cliente poderão ser encaminhadas ao respectivo controlador.</p>
    <h2>Limites</h2><p>A exclusão poderá não ser imediata quando houver obrigação legal, fiscal, regulatória, prevenção à fraude ou necessidade de exercício de direitos. Nesses casos, os dados serão bloqueados ou restritos quando aplicável.</p>
    <h2>Meta</h2><p>Desconectar o WhatsApp interrompe novas operações, mas não substitui uma solicitação formal de exclusão dos dados já tratados no ZapNFe.</p>
  </LegalPage>;
}
