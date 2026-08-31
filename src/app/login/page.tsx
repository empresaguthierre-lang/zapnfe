import Link from "next/link";
import { redirect } from "next/navigation";
import { FiShield } from "react-icons/fi";
import { LoginForm } from "@/components/login-form";
import { getAuthorizationContext } from "@/lib/auth/authorization";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const context = await getAuthorizationContext();
  if (context.member) redirect("/pedidos");
  if (context.user) redirect("/acesso-negado");

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link className="auth-brand" href="/"><span className="brand-mark">Z</span><strong>ZapNFe</strong></Link>
        <div className="auth-heading"><span><FiShield /></span><div><p className="eyebrow">Acesso protegido</p><h1>Entrar na operação</h1></div></div>
        <p className="auth-description">Use uma conta vinculada a uma empresa. Permissões e dados são validados novamente no servidor.</p>
        <LoginForm />
        <p className="auth-footnote">Não há cadastro público. O primeiro administrador é criado por um processo controlado.</p>
      </section>
    </main>
  );
}
