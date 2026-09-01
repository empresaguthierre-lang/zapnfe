import { FiLock } from "react-icons/fi";
export function ComingSoon({ title, description }: { title: string; description: string }) { return <section className="panel erp-coming-soon"><FiLock /><p className="eyebrow">Em breve</p><h2>{title}</h2><p>{description}</p><span>O módulo já está previsto na arquitetura, mas ainda não movimenta dados operacionais.</span></section>; }
