'use client';
import { FiBox, FiClock, FiCheck } from 'react-icons/fi';

type StockSummary = { quantity_on_hand: number | null; quantity_reserved: number | null; quantity_available: number | null };
type ProductReservation = { reservation_id: string; order_number: number; customer_name: string; quantity: number };

export function ProductStockStatus({ stock, reservations }: { stock: StockSummary; reservations: ProductReservation[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <article className="panel readiness-card done" style={{ margin: 0 }}>
          <FiBox />
          <div>
            <strong>Estoque Físico</strong>
            <p>{stock.quantity_on_hand || 0} unidades</p>
          </div>
        </article>

        <article className="panel readiness-card pending" style={{ margin: 0, paddingBottom: '1rem' }}>
          <FiClock />
          <details style={{ width: '100%' }}>
            <summary style={{ cursor: 'pointer', outline: 'none' }}>
              <strong>Reservado</strong>
              <p>{stock.quantity_reserved || 0} unidades (clique para ver detalhes)</p>
            </summary>
            {reservations.length > 0 ? (
              <div style={{ marginTop: '1rem', fontSize: '0.85rem' }}>
                <strong style={{ display: 'block', marginBottom: '0.5rem' }}>Consumido pelos pedidos:</strong>
                {reservations.map(r => (
                  <div key={r.reservation_id} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '0.25rem', marginBottom: '0.25rem' }}>
                    <span>Pedido #{r.order_number} ({r.customer_name})</span>
                    <span><strong>{r.quantity} un.</strong></span>
                  </div>
                ))}
              </div>
            ) : (
               <div style={{ marginTop: '1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Nenhuma reserva ativa.</div>
            )}
          </details>
        </article>

        <article className={"panel readiness-card " + ((stock.quantity_available ?? 0) > 0 ? 'done' : 'danger')} style={{ margin: 0 }}>
          <FiCheck />
          <div>
            <strong>Disponível</strong>
            <p>{stock.quantity_available || 0} unidades</p>
          </div>
        </article>
      </div>
  );
}
