export type ReceivablePayment = {
  id: string;
  amount: number;
  principal_amount: number;
  interest_amount: number;
  penalty_amount: number;
  discount_amount: number;
  paid_at: string;
  reference: string | null;
  notes: string | null;
  reversal_of_id: string | null;
};

export type ReceivableInstallment = {
  id: string;
  installment_number: number;
  original_amount: number;
  open_amount: number;
  due_on: string;
  status: string;
  receivable_payments: ReceivablePayment[];
};

export type ReceivableDetails = {
  id: string;
  document_number: string | null;
  issued_on: string;
  status: string;
  original_amount: number;
  customers: { name: string } | null;
  receivable_installments: ReceivableInstallment[];
};

export type FinanceLookups = {
  customers: { id: string; name: string }[];
  paymentTerms: { id: string; code: string; name: string }[];
  bankAccounts: { id: string; account_name: string }[];
  paymentMethods: { id: string; name: string }[];
};

export type ReceivableListRow = {
  id: string;
  installment_number: number;
  original_amount: number;
  open_amount: number;
  due_on: string;
  status: string;
  accounts_receivable: {
    document_number: string | null;
    description: string | null;
    customer_id: string;
    customers: { name: string } | null;
  } | null;
};
