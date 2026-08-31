import Link from "next/link";
import { FiAlertTriangle, FiHome } from "react-icons/fi";
import { logoutAction } from "@/app/auth/actions";

export const dynamic = "force-dynamic";

export default function AccessDeniedPage() {
  return (
    <main className="auth-page">
      <section className="auth-card compact">
        <span className="denied-icon"><FiAlertTriangle /></span>
        <p className="eyebrow">Acesso negado</p>
        <h1>Conta sem permissão</h1>
        <p className="auth-description">Sua sessão é válida, mas não existe um vínculo ativo ou o seu papel não permite abrir esta área.</p>
        <form action={logoutAction}><button className="primary-button auth-submit" type="submit">Sair e usar outra conta</button></form>
        <Link className="secondary-button auth-submit" href="/"><FiHome /> Voltar à página inicial</Link>
      </section>
    </main>
  );
}
