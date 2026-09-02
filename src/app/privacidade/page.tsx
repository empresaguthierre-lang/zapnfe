import { LegalPage } from "@/components/legal-page";

export default function PrivacyPage() {
  return <LegalPage title="Aviso de Privacidade" updatedAt="25 de agosto de 2026">
    <p>O Bridge ERP trata dados necessários para transformar mensagens comerciais em pedidos estruturados e documentos fiscais. A versão definitiva deste aviso deverá identificar a pessoa jurídica operadora do Bridge ERP, seu CNPJ, endereço e encarregado antes da ativação pública.</p>
    <h2>Dados tratados</h2><p>Dados cadastrais de empresas e usuários, telefones, mensagens comerciais recebidas, catálogo, pedidos, registros técnicos, identificadores da Meta/WhatsApp e informações fiscais estritamente necessárias à prestação do serviço.</p>
    <h2>Finalidades</h2><p>Autenticar usuários, receber e organizar pedidos, prevenir fraude, manter segurança e auditoria, prestar suporte, cumprir obrigações contratuais, legais e regulatórias e, quando contratado, emitir documentos fiscais.</p>
    <h2>Compartilhamento</h2><p>Os dados poderão ser processados por fornecedores essenciais, como hospedagem, banco de dados, Meta/WhatsApp, inteligência artificial e emissão fiscal, conforme contratos, instruções da empresa cliente e legislação aplicável. Não vendemos dados pessoais.</p>
    <h2>Retenção e segurança</h2><p>Os dados serão mantidos somente pelo período necessário às finalidades informadas, obrigações legais e defesa de direitos. Aplicamos segregação por empresa, controle de acesso, criptografia em trânsito, registros de auditoria, validação de entradas e monitoramento de vulnerabilidades.</p>
    <h2>Direitos</h2><p>O titular pode solicitar confirmação, acesso, correção, informações sobre compartilhamento, oposição, revisão de decisões automatizadas, anonimização, bloqueio ou eliminação quando aplicável. A identidade do solicitante deverá ser verificada.</p>
    <h2>Contato</h2><p>O canal oficial de privacidade e a identificação do encarregado serão publicados antes da entrada em produção. Enquanto esses dados estiverem ausentes, o produto deve permanecer em homologação.</p>
  </LegalPage>;
}
