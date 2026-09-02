export type CanonicalInvoiceStatus = 
  | "draft"
  | "ready"
  | "submission_pending"
  | "submitted"
  | "processing"
  | "authorized"
  | "rejected"
  | "cancellation_pending"
  | "cancelled"
  | "error"
  | "superseded";

export type IssueInvoiceInput = {
  invoiceId: string;
  payload: any;
  environment: "homologation" | "production";
  credentials: any;
};

export type IssueInvoiceResult = {
  success: boolean;
  canonicalStatus: CanonicalInvoiceStatus;
  providerStatus?: string;
  providerReference?: string;
  rawResponse?: any;
  error?: string;
  errorCode?: string;
  isRetryableError?: boolean;
};

export type GetInvoiceStatusInput = {
  invoiceId: string;
  providerReference: string;
  environment: "homologation" | "production";
  credentials: any;
};

export type GetInvoiceStatusResult = {
  success: boolean;
  canonicalStatus: CanonicalInvoiceStatus;
  providerStatus?: string;
  rawResponse?: any;
  accessKey?: string;
  authorizationProtocol?: string;
  authorizedAt?: string;
  error?: string;
  errorCode?: string;
  isRetryableError?: boolean;
};

export type CancelInvoiceInput = {
  invoiceId: string;
  providerReference: string;
  accessKey: string;
  justification: string;
  environment: "homologation" | "production";
  credentials: any;
};

export type CancelInvoiceResult = {
  success: boolean;
  providerStatus?: string;
  canonicalStatus: CanonicalInvoiceStatus;
  cancellationProtocol?: string;
  rawResponse?: any;
  error?: string;
};

export type CorrectInvoiceInput = {
  invoiceId: string;
  providerReference: string;
  accessKey: string;
  correctionText: string;
  sequence: number;
  environment: "homologation" | "production";
  credentials: any;
};

export type CorrectInvoiceResult = {
  success: boolean;
  providerStatus?: string;
  correctionProtocol?: string;
  rawResponse?: any;
  error?: string;
};

export type DownloadFiscalDocumentInput = {
  invoiceId: string;
  providerReference: string;
  environment: "homologation" | "production";
  credentials: any;
};

export type FiscalFileResult = {
  success: boolean;
  fileData?: Buffer | string;
  contentType?: string;
  error?: string;
};

export type CheckFiscalServiceInput = {
  environment: "homologation" | "production";
  credentials: any;
  stateCode?: string;
};

export type FiscalServiceStatusResult = {
  online: boolean;
  avgResponseTimeMs?: number;
  message?: string;
};

export interface FiscalProvider {
  issueInvoice(input: IssueInvoiceInput): Promise<IssueInvoiceResult>;
  getInvoiceStatus(input: GetInvoiceStatusInput): Promise<GetInvoiceStatusResult>;
  cancelInvoice(input: CancelInvoiceInput): Promise<CancelInvoiceResult>;
  correctInvoice(input: CorrectInvoiceInput): Promise<CorrectInvoiceResult>;
  downloadXml(input: DownloadFiscalDocumentInput): Promise<FiscalFileResult>;
  downloadDanfe(input: DownloadFiscalDocumentInput): Promise<FiscalFileResult>;
  checkServiceStatus?(input: CheckFiscalServiceInput): Promise<FiscalServiceStatusResult>;
}

