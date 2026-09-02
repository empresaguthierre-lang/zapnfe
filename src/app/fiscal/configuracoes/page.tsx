import Link from "next/link";
import { FiSettings, FiShield, FiAlertTriangle, FiCheckCircle } from "react-icons/fi";
import { AppShell } from "@/components/app-shell";
import { requireOrganizationMember } from "@/lib/auth/authorization";

export default async function FiscalSettingsPage() {
  const member = await requireOrganizationMember();

  // MOCK: This would come from fiscal_provider_accounts + fiscal_settings
  const provider = {
    code: "focus_nfe",
    name: "Focus NFe",
    environment: "homologation", // Forced to homologation for safety
    active: true
  };

  return (
    <AppShell active="fiscal" eyebrow="Fiscal" title="Configurações e Provedor" actions={<button className="primary-button" disabled>Salvar</button>}>
      
      {provider.environment === 'homologation' && (
        <div style={{ marginBottom: 24, padding: "16px", borderRadius: "12px", background: "#fef08a", border: "1px solid #fde047", display: "flex", gap: "12px", color: "#854d0e" }}>
           <FiAlertTriangle size={24} style={{ flexShrink: 0, marginTop: 4 }} />
           <div>
             <strong style={{ fontSize: "14px", display: "block" }}>AMBIENTE DE HOMOLOGAÇÃO</strong>
             <p style={{ margin: "4px 0 0 0", fontSize: "13px" }}>
               O emissor fiscal está operando em ambiente de testes. As notas transmitidas <strong>NÃO</strong> possuem validade jurídica. Nunca mude de ambiente com rascunhos abertos.
             </p>
           </div>
        </div>
      )}

      <div className="panel" style={{ padding: 24, marginBottom: 24 }}>
        <h3 style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 16px 0", color: "var(--ink)" }}>
           <FiShield /> Provedor de Transmissão (Adapter)
        </h3>
        
        <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 24 }}>
          O Bridge ERP usa adaptadores para se comunicar com as APIs fiscais (SEFAZ/Prefeituras). As credenciais não são expostas ao frontend.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          <div className="form-group">
            <label>Provedor Selecionado</label>
            <select className="form-input" defaultValue={provider.code} disabled>
              <option value="test_mock">Test Mock (Simulação Local)</option>
              <option value="focus_nfe">Focus NFe (Integração Oficial)</option>
              <option value="nuvem_fiscal">Nuvem Fiscal</option>
            </select>
          </div>

          <div className="form-group">
            <label>Ambiente</label>
            <select className="form-input" defaultValue={provider.environment} disabled>
              <option value="homologation">Homologação (Testes)</option>
              <option value="production">Produção (Validade Jurídica)</option>
            </select>
          </div>
        </div>

        <div style={{ marginTop: 24, paddingTop: 24, borderTop: "1px solid var(--line)" }}>
          <h4 style={{ margin: "0 0 12px 0", fontSize: 13, textTransform: "uppercase", color: "var(--text-secondary)", letterSpacing: "0.5px" }}>Credenciais do Certificado Digital</h4>
          <div style={{ display: "flex", gap: 12, alignItems: "center", background: "#f8fafc", padding: 12, borderRadius: 8 }}>
            <FiCheckCircle color="var(--success)" /> 
            <span style={{ fontSize: 14 }}>Referência Segura (KMS/Vault) vinculada. Vence em 360 dias.</span>
          </div>
        </div>
      </div>
      
    </AppShell>
  );
}