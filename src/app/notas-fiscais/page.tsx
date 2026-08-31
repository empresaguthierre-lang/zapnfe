import { FiCheckCircle, FiClock, FiFileText, FiLock } from "react-icons/fi";
import { AppShell } from "@/components/app-shell";
import { requireOrganizationMember } from "@/lib/auth/authorization";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  await requireOrganizationMember();
  return (
    <AppShell active="invoices" eyebrow="Fiscal" title="Notas fiscais">
      <section className="page-intro"><div><h2>Emissão preparada para homologação</h2><p>A estrutura fiscal pode ser construída agora; nenhuma nota real será emitida sem revisão e credenciais.</p></div></section>
      <section className="readiness-grid">
        <article className="panel readiness-card done"><FiCheckCircle /><div><strong>Pedido conferido</strong><p>Tela de revisão, totais e bloqueios disponíveis.</p></div></article>
        <article className="panel readiness-card pending"><FiClock /><div><strong>Cadastro fiscal</strong><p>NCM, CFOP e tributação serão completados no catálogo.</p></div></article>
        <article className="panel readiness-card locked"><FiLock /><div><strong>Focus NFe</strong><p>Token de homologação ainda não configurado.</p></div></article>
      </section>
      <section className="panel empty-state large"><FiFileText /><strong>Nenhuma NF-e emitida</strong><p>Esta tela exibirá autorização, rejeições, DANFE e XML quando a integração fiscal estiver ativa.</p></section>
    </AppShell>
  );
}
