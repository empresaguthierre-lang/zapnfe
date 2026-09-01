"use client";

import { useEffect, useState, useTransition } from "react";
import { FiX, FiAlertTriangle, FiLock, FiCheckCircle } from "react-icons/fi";
import { getActiveReservationsAction, getInventoryOverviewAction, reallocateReservationAction, getServicePriorityAction } from "@/app/pedidos/actions";
import type { OrderDetail } from "@/lib/data/types";

type PriorityFactor = { code: string; label: string };
type ServicePriority = { score: number; factors?: PriorityFactor[] };
type Reservation = {
  reservation_id: string;
  order_id: string;
  order_number: number;
  customer_name: string;
  quantity: number;
};
type PrioritizedReservation = Reservation & { priority: ServicePriority | null };

export function ReallocationModal({
  productId,
  productName,
  targetOrder,
  targetOrderItemId,
  neededQuantity,
  onClose,
  onReallocated,
  onForceApprove
}: {
  productId: string;
  productName: string;
  targetOrder: OrderDetail;
  targetOrderItemId: string;
  neededQuantity: number;
  onClose: () => void;
  onReallocated: () => void;
  onForceApprove: () => void;
}) {
  const [inventory, setInventory] = useState<{ onHand: number, reserved: number, available: number } | null>(null);
  const [reservations, setReservations] = useState<PrioritizedReservation[]>([]);
  const [targetPriority, setTargetPriority] = useState<ServicePriority | null>(null);
  const [loading, setLoading] = useState(true);
  const [reallocatingSource, setReallocatingSource] = useState<PrioritizedReservation | null>(null);
  const [reallocQty, setReallocQty] = useState("");
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [inv, resList, targetPrio] = await Promise.all([
          getInventoryOverviewAction(productId),
          getActiveReservationsAction(productId),
          getServicePriorityAction(targetOrder.id)
        ]);

        if (inv) setInventory({ onHand: inv.quantity_on_hand, reserved: inv.quantity_reserved, available: inv.quantity_available });
        setTargetPriority(targetPrio as ServicePriority | null);

        // Fetch priorities for all reservations
        const typedReservations = resList as unknown as Reservation[];
        const filtered = typedReservations.filter((reservation) => reservation.order_id !== targetOrder.id);
        const withPriorities = await Promise.all(filtered.map(async (reservation): Promise<PrioritizedReservation> => {
          const priority = await getServicePriorityAction(reservation.order_id);
          return { ...reservation, priority: priority as ServicePriority | null };
        }));

        // Sort by lowest score first
        withPriorities.sort((a, b) => (a.priority?.score || 0) - (b.priority?.score || 0));

        setReservations(withPriorities);
      } catch (loadError: unknown) {
        setError(loadError instanceof Error ? loadError.message : "Erro ao carregar");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [productId, targetOrder.id]);

  function handleReallocate() {
    if (!reallocatingSource || !reallocQty || !reason) return;
    const qty = Number(reallocQty);
    if (qty <= 0 || qty > reallocatingSource.quantity) {
      setError("Quantidade inválida.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await reallocateReservationAction({
        sourceReservationId: reallocatingSource.reservation_id,
        targetOrderItemId,
        quantity: qty,
        reason
      });
      if (!res.ok) {
        setError(res.message || "Erro desconhecido");
      } else {
        setReallocatingSource(null);
        setReallocQty("");
        setReason("");
        onReallocated();
      }
    });
  }

  const missing = inventory ? Math.max(0, neededQuantity - inventory.available) : 0;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 650 }}>
        <div className="modal-header">
          <h3><FiAlertTriangle className="warning-icon" /> Estoque Insuficiente</h3>
          <button onClick={onClose} className="icon-button"><FiX /></button>
        </div>

        <div className="modal-body">
          <h4 style={{ marginBottom: 16 }}>{productName}</h4>

          {loading ? <p>Analisando prioridades de estoque...</p> : (
            <>
              <div className="stock-summary-cards" style={{ display: "flex", gap: 16, marginBottom: 24 }}>
                <div className="stat-card">
                  <span className="label">Pedido Atual</span>
                  <strong>{neededQuantity} UN</strong>
                  {targetPriority && <small>Prioridade: {targetPriority.score}/100</small>}
                </div>
                <div className="stat-card">
                  <span className="label">Físico Disponível</span>
                  <strong>{inventory?.available ?? 0} UN</strong>
                </div>
                <div className="stat-card warning-stat">
                  <span className="label">Faltam</span>
                  <strong>{missing} UN</strong>
                </div>
              </div>

              {reallocatingSource ? (
                <div className="reallocation-form panel">
                  <h4>Confirmar Realocação</h4>
                  <div style={{ padding: "12px", background: "var(--bg-body)", borderRadius: 6, marginBottom: 16 }}>
                    <p style={{ margin: "0 0 8px 0" }}>De: <strong>Pedido #{reallocatingSource.order_number}</strong> (Prioridade: {reallocatingSource.priority?.score}/100)</p>
                    <p style={{ margin: 0 }}>Para: <strong>Pedido #{targetOrder.number}</strong> (Prioridade: {targetPriority?.score}/100)</p>
                  </div>

                  {(reallocatingSource.priority?.score ?? 0) > (targetPriority?.score || 0) && (
                    <div className="action-error" style={{ marginBottom: 16, borderLeft: "4px solid var(--danger)", padding: 12 }}>
                      <FiAlertTriangle /> <strong>ATENÇÃO:</strong> Você está retirando estoque de um pedido com prioridade superior (Origem: {reallocatingSource.priority?.score} vs Destino: {targetPriority?.score}).
                    </div>
                  )}

                  <label style={{ display: "block", marginTop: 16 }}>
                    <span>Quantidade a realocar (Máx {reallocatingSource.quantity}):</span>
                    <input type="number" min="1" max={reallocatingSource.quantity} value={reallocQty} onChange={e => setReallocQty(e.target.value)} disabled={isPending} />
                  </label>

                  <label style={{ display: "block", marginTop: 16 }}>
                    <span>Motivo (obrigatório):</span>
                    <textarea placeholder="Ex: Prioridade comercial confirmada com diretoria" value={reason} onChange={e => setReason(e.target.value)} disabled={isPending} />
                  </label>

                  {error && <div className="action-error" style={{ marginTop: 16 }}>{error}</div>}

                  <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                    <button className="primary-button" onClick={handleReallocate} disabled={isPending || !reallocQty || reason.length < 5}>
                      {isPending ? "Processando..." : ((reallocatingSource.priority?.score ?? 0) > (targetPriority?.score || 0) ? "Realocar mesmo assim" : "Confirmar Realocação")}
                    </button>
                    <button className="secondary-button" onClick={() => setReallocatingSource(null)} disabled={isPending}>
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <h4>Candidatos à Realocação ({reservations.length} pedidos)</h4>
                  <p className="eyebrow" style={{ marginBottom: 16 }}>Ordenado pela menor prioridade</p>

                  {reservations.length === 0 ? (
                    <p className="empty-state">Nenhum outro pedido possui este item reservado.</p>
                  ) : (
                    <div className="reservations-list" style={{ maxHeight: 400, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
                      {reservations.map(r => {
                        const prio = r.priority?.score || 0;
                        const isBestCandidate = prio < (targetPriority?.score || 0);
                        const isPreserve = prio >= 80;

                        return (
                          <div key={r.reservation_id} className="reservation-item" style={{ padding: 16, border: "1px solid var(--border)", borderRadius: 6, display: "flex", justifyContent: "space-between", alignItems: "flex-start", background: "var(--bg-body)" }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                <strong>#{r.order_number} - {r.customer_name}</strong>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, fontWeight: 500 }}>
                                Prioridade: {prio}/100
                                {isBestCandidate && <span style={{ color: "var(--success)", fontSize: "0.85em", display: "flex", alignItems: "center", gap: 4 }}><FiCheckCircle /> Candidato à realocação</span>}
                                {isPreserve && <span style={{ color: "var(--text-secondary)", fontSize: "0.85em", display: "flex", alignItems: "center", gap: 4 }}><FiLock /> Recomenda-se preservar</span>}
                              </div>

                              <ul style={{ margin: 0, paddingLeft: 16, fontSize: "0.85em", color: "var(--text-secondary)" }}>
                                {r.priority?.factors?.map((factor) => (
                                  <li key={factor.code}>{factor.label}</li>
                                ))}
                              </ul>
                            </div>

                            <div style={{ textAlign: "right", display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
                              <strong style={{ fontSize: "1.1em" }}>{r.quantity} UN</strong>
                              <button className="secondary-button small-button" onClick={() => setReallocatingSource(r)}>
                                {isPreserve ? "Realocar mesmo assim" : "Realocar"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="modal-actions" style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--border)", display: "flex", gap: 12, justifyContent: "space-between" }}>
                    <button className="danger-button" onClick={onForceApprove} disabled={isPending}>
                      Forçar Aprovação (Reserva Parcial)
                    </button>
                    <button className="secondary-button" onClick={onClose} disabled={isPending}>
                      Fechar
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
      <style jsx>{`
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .modal-content { background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; width: 100%; max-height: 90vh; overflow-y: auto; padding: 24px; box-shadow: 0 10px 25px rgba(0,0,0,0.2); }
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        .modal-header h3 { margin: 0; display: flex; align-items: center; gap: 8px; color: var(--danger); }
        .stat-card { flex: 1; padding: 16px; background: var(--bg-body); border-radius: 6px; border: 1px solid var(--border); display: flex; flex-direction: column; align-items: center; }
        .warning-stat { border-color: var(--danger); color: var(--danger); }
        .small-button { padding: 4px 12px; font-size: 0.85em; }
      `}</style>
    </div>
  );
}
