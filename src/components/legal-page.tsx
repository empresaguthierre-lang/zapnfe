import Link from "next/link";

export function LegalPage({ title, updatedAt, children }: { title: string; updatedAt: string; children: React.ReactNode }) {
  return <main style={{ maxWidth: 860, margin: "0 auto", padding: "48px 24px 80px", lineHeight: 1.7 }}>
    <Link href="/" style={{ color: "#2a9d8f", fontWeight: 700 }}>← Bridge ERP</Link>
    <h1 style={{ color: "#1d3557", marginTop: 32 }}>{title}</h1>
    <p style={{ color: "#68778b" }}>Última atualização: {updatedAt}</p>
    <div>{children}</div>
    <hr style={{ margin: "40px 0", border: 0, borderTop: "1px solid #e5ebef" }} />
    <nav style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
      <Link href="/privacidade">Privacidade</Link><Link href="/termos">Termos</Link><Link href="/exclusao-de-dados">Exclusão de dados</Link>
    </nav>
  </main>;
}
