"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createManualReceivableAction } from "@/app/financeiro/actions";
import { formatCurrency } from "@/lib/data/format";
import { FiTrash2, FiPlus } from "react-icons/fi";

type LookupData = {
  customers: { id: string; name: string }[];
  paymentTerms: { id: string; code: string; name: string }[];
  bankAccounts: { id: string; account_name: string }[];
  paymentMethods: { id: string; name: string }[];
};

export function CreateReceivableForm({ lookups }: { lookups: LookupData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [description, setDescription] = useState("");
  const [originalAmount, setOriginalAmount] = useState("");
  const [issuedOn, setIssuedOn] = useState(new Date().toISOString().split("T")[0]);
  const [competenceDate, setCompetenceDate] = useState(new Date().toISOString().split("T")[0]);

  const [installments, setInstallments] = useState<{ id: string; amount: string; dueOn: string }[]>([
    { id: "1", amount: "", dueOn: new Date().toISOString().split("T")[0] }
  ]);

  function handleAddInstallment() {
    setInstallments([...installments, { id: Date.now().toString(), amount: "", dueOn: new Date().toISOString().split("T")[0] }]);
  }

  function handleRemoveInstallment(id: string) {
    if (installments.length === 1) return;
    setInstallments(installments.filter(i => i.id !== id));
  }

  function handleInstallmentChange(id: string, field: "amount" | "dueOn", value: string) {
    setInstallments(installments.map(i => i.id === id ? { ...i, [field]: value } : i));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!customerId || !originalAmount || installments.length === 0) {
      setError("Preencha todos os campos obrigatórios.");
      return;
    }

    const totalAmount = Number(originalAmount);
    const parsedInstallments = installments.map((i, idx) => ({
      installment_number: idx + 1,
      amount: Number(i.amount),
      due_on: i.dueOn
    }));

    const sum = parsedInstallments.reduce((acc, curr) => acc + curr.amount, 0);
    if (Math.abs(sum - totalAmount) > 0.01) {
      setError(`A soma das parcelas (${formatCurrency(sum)}) deve ser igual ao valor total do título (${formatCurrency(totalAmount)}).`);
      return;
    }

    startTransition(async () => {
      const res = await createManualReceivableAction({
        customerId,
        documentNumber,
        description,
        originalAmount: totalAmount,
        issuedOn,
        competenceDate,
        installments: parsedInstallments
      });

      if (!res.ok) {
        setError(res.message || "Erro desconhecido");
      } else {
        router.push(`/financeiro/receber/${res.receivableId}`);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="panel" style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 800 }}>
      {error && <div className="action-error" style={{ background: "rgba(255,0,0,0.1)", color: "var(--danger)", padding: 12, borderRadius: 6, border: "1px solid rgba(255,0,0,0.3)" }}>{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span>Cliente *</span>
          <select value={customerId} onChange={e => setCustomerId(e.target.value)} required>
            <option value="">Selecione um cliente...</option>
            {lookups.customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span>Valor Total *</span>
          <input type="number" step="0.01" min="0.01" value={originalAmount} onChange={e => setOriginalAmount(e.target.value)} required placeholder="Ex: 10000.00" />
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span>Número do Documento</span>
          <input type="text" value={documentNumber} onChange={e => setDocumentNumber(e.target.value)} placeholder="Ex: NF-1234, C-99" />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span>Descrição</span>
          <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Referente ao serviço..." />
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span>Data de Emissão *</span>
          <input type="date" value={issuedOn} onChange={e => setIssuedOn(e.target.value)} required />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span>Data de Competência *</span>
          <input type="date" value={competenceDate} onChange={e => setCompetenceDate(e.target.value)} required />
        </label>
      </div>

      <hr style={{ border: 0, borderTop: "1px solid var(--border)", margin: "8px 0" }} />

      <div>
        <h4 style={{ marginBottom: 16 }}>Parcelas</h4>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {installments.map((inst, index) => (
            <div key={inst.id} style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
              <div style={{ paddingBottom: 10, fontWeight: 600, color: "var(--text-secondary)", width: 40 }}>
                {index + 1}
              </div>
              <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: "0.85em" }}>Vencimento</span>
                <input type="date" value={inst.dueOn} onChange={e => handleInstallmentChange(inst.id, "dueOn", e.target.value)} required />
              </label>
              <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: "0.85em" }}>Valor (R$)</span>
                <input type="number" step="0.01" min="0.01" value={inst.amount} onChange={e => handleInstallmentChange(inst.id, "amount", e.target.value)} required />
              </label>
              <button type="button" onClick={() => handleRemoveInstallment(inst.id)} disabled={installments.length === 1} className="icon-button" style={{ color: "var(--danger)", padding: 8, height: 40 }} title="Remover">
                <FiTrash2 />
              </button>
            </div>
          ))}
        </div>

        <button type="button" onClick={handleAddInstallment} className="secondary-button" style={{ marginTop: 16, display: "inline-flex", alignItems: "center", gap: 8 }}>
          <FiPlus /> Adicionar Parcela
        </button>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
        <button type="submit" className="primary-button" disabled={isPending}>
          {isPending ? "Criando..." : "Criar Título"}
        </button>
      </div>
    </form>
  );
}
