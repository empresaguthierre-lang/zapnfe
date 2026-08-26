import { FiCheckCircle, FiDatabase, FiFileText, FiMessageCircle, FiShield, FiZap } from "react-icons/fi";
import { AppShell } from "@/components/app-shell";

const integrations = [
  { name: "Supabase", description: "Autenticação, banco multiempresa e arquivos.", status: "Pendente", icon: FiDatabase },
  { name: "Gemini", description: "Extração estruturada dos itens do pedido.", status: "Pendente", icon: FiZap },
  { name: "WhatsApp Cloud API", description: "Aguardando o novo número comercial para homologação.", status: "Aguardando número", icon: FiMessageCircle },
  { name: "Focus NFe", description: "Emissão fiscal inicialmente em homologação.", status: "Pendente", icon: FiFileText },
];

export default function SettingsPage() {
  return (
    <AppShell active="settings" eyebrow="Ambiente" title="Configurações">
      <section className="page-intro"><div><h2>Integrações e segurança</h2><p>As credenciais serão inseridas diretamente nos ambientes, nunca no navegador, chat ou Git.</p></div></section>
      <section className="integration-grid">
        {integrations.map(({ name, description, status, icon: Icon }) => <article className="panel integration-card" key={name}><span className="integration-icon"><Icon /></span><div><strong>{name}</strong><p>{description}</p></div><span className="integration-status">{status}</span></article>)}
      </section>
      <section className="panel security-summary"><FiShield /><div><p className="eyebrow">Já aplicado</p><h3>Baseline de segurança</h3><ul><li><FiCheckCircle /> CSP com nonce e headers de proteção</li><li><FiCheckCircle /> Validação e limites de entrada</li><li><FiCheckCircle /> Gitleaks, OpenGrep, npm audit e OWASP ZAP</li><li><FiCheckCircle /> Banco preparado para RLS multiempresa</li></ul></div></section>
    </AppShell>
  );
}
