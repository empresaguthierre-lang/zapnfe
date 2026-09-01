"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrganizationMember, requireOrganizationRole } from "@/lib/auth/authorization";
import { normalizeUntrustedText } from "@/lib/security/input";
import { createClient } from "@/lib/supabase/server";

const installmentSchema = z.object({
  installment_number: z.number().int().min(1),
  amount: z.number().positive(),
  due_on: z.string().date(), // YYYY-MM-DD
});

const createReceivableSchema = z.object({
  customerId: z.string().uuid(),
  documentNumber: z.string().transform((value) => normalizeUntrustedText(value, 100)).optional().default(""),
  description: z.string().transform((value) => normalizeUntrustedText(value, 500)).optional().default(""),
  originalAmount: z.number().positive(),
  issuedOn: z.string().date(),
  competenceDate: z.string().date(),
  installments: z.array(installmentSchema).min(1),
});

export async function createManualReceivableAction(input: unknown) {
  const member = await requireOrganizationRole(["admin", "manager"]);
  const parsed = createReceivableSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Dados inválidos." };
  }

  const { customerId, documentNumber, description, originalAmount, issuedOn, competenceDate, installments } = parsed.data;

  // Validate sum
  const sum = installments.reduce((acc, curr) => acc + curr.amount, 0);
  if (Math.abs(sum - originalAmount) > 0.01) {
    return { ok: false, message: "A soma das parcelas deve ser igual ao valor total do título." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("finance_create_receivable", {
    p_org_id: member.organizationId,
    p_branch_id: null,
    p_customer_id: customerId,
    p_source_type: "manual",
    p_source_id: null,
    p_document_number: documentNumber,
    p_description: description,
    p_original_amount: originalAmount,
    p_issued_on: issuedOn,
    p_competence_date: competenceDate,
    p_installments: installments
  });

  if (error) {
    return { ok: false, message: "Não foi possível criar o título." };
  }

  revalidatePath("/financeiro");
  revalidatePath("/financeiro/receber");
  revalidatePath(`/clientes/${customerId}`);

  return { ok: true, receivableId: data };
}

const registerPaymentSchema = z.object({
  installmentId: z.string().uuid(),
  bankAccountId: z.string().uuid(),
  paymentMethodId: z.string().uuid().optional().nullable(),
  principal: z.number().min(0.01),
  interest: z.number().min(0).default(0),
  penalty: z.number().min(0).default(0),
  discount: z.number().min(0).default(0),
  paidAt: z.string().datetime({ offset: true }),
  reference: z.string().transform((value) => normalizeUntrustedText(value, 100)).optional().default(""),
  notes: z.string().transform((value) => normalizeUntrustedText(value, 500)).optional().default(""),
});

export async function registerPaymentAction(input: unknown) {
  const member = await requireOrganizationRole(["admin", "manager"]);
  const parsed = registerPaymentSchema.safeParse(input);

  if (!parsed.success) return { ok: false, message: "Dados do recebimento inválidos." };

  const d = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("finance_register_payment", {
    p_org_id: member.organizationId,
    p_branch_id: null,
    p_installment_id: d.installmentId,
    p_bank_account_id: d.bankAccountId,
    p_payment_method_id: d.paymentMethodId || null,
    p_principal: d.principal,
    p_interest: d.interest,
    p_penalty: d.penalty,
    p_discount: d.discount,
    p_paid_at: d.paidAt,
    p_reference: d.reference,
    p_notes: d.notes,
  });

  if (error) {
    if (error.message.includes("PAYMENT_EXCEEDS_OPEN_AMOUNT")) {
      return { ok: false, message: "O valor aplicado ao principal é maior que o saldo da parcela em aberto." };
    }
    return { ok: false, message: "Não foi possível registrar o recebimento." };
  }

  revalidatePath("/financeiro");
  revalidatePath("/financeiro/receber");

  return { ok: true, paymentId: data };
}

const reversePaymentSchema = z.object({
  paymentId: z.string().uuid(),
  reason: z.string().transform((value) => normalizeUntrustedText(value, 500)).pipe(z.string().min(5)),
});

export async function reversePaymentAction(input: unknown) {
  const member = await requireOrganizationRole(["admin", "manager"]);
  const parsed = reversePaymentSchema.safeParse(input);

  if (!parsed.success) return { ok: false, message: "Dados inválidos." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("finance_reverse_payment", {
    p_org_id: member.organizationId,
    p_payment_id: parsed.data.paymentId,
    p_reason: parsed.data.reason
  });

  if (error) {
    if (error.message.includes("CANNOT_REVERSE_A_REVERSAL")) {
      return { ok: false, message: "Este pagamento já foi estornado." };
    }
    return { ok: false, message: "Não foi possível estornar o recebimento." };
  }

  revalidatePath("/financeiro");
  revalidatePath("/financeiro/receber");

  return { ok: true, reversalId: data };
}

export async function getReceivableDetailsAction(receivableId: string) {
  const member = await requireOrganizationMember();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("accounts_receivable")
    .select(`
      *,
      customers (name),
      receivable_installments (
        id, installment_number, original_amount, open_amount, due_on, status,
        receivable_payments (
          id, amount, principal_amount, interest_amount, penalty_amount, discount_amount, paid_at, reference, notes, reversal_of_id, created_by
        )
      )
    `)
    .eq("id", receivableId)
    .eq("organization_id", member.organizationId)
    .single();

  if (error) throw new Error("Não foi possível carregar o título.");
  return data;
}

export async function getFormLookupsAction() {
  const member = await requireOrganizationMember();
  const supabase = await createClient();

  const [customersRes, paymentTermsRes, bankAccountsRes, paymentMethodsRes] = await Promise.all([
    supabase.from("customers").select("id, name").eq("organization_id", member.organizationId).eq("active", true).order("name"),
    supabase.from("payment_terms").select("id, code, name").eq("organization_id", member.organizationId).eq("active", true).order("name"),
    supabase.from("bank_accounts").select("id, account_name").eq("organization_id", member.organizationId).eq("active", true).order("account_name"),
    supabase.from("payment_methods").select("id, name").eq("organization_id", member.organizationId).eq("active", true).order("name")
  ]);

  return {
    customers: customersRes.data || [],
    paymentTerms: paymentTermsRes.data || [],
    bankAccounts: bankAccountsRes.data || [],
    paymentMethods: paymentMethodsRes.data || []
  };
}
