"use client";
export default function ErpError({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <main className="erp-coming-soon"><h1>Não foi possível carregar o ERP</h1><p>O erro foi isolado e nenhum dado foi alterado.</p><button className="primary-button" onClick={() => reset()}>Tentar novamente</button></main>; }
