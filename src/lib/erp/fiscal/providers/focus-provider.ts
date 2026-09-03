/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { 
  FiscalProvider, 
  IssueInvoiceInput, IssueInvoiceResult,
  GetInvoiceStatusInput, GetInvoiceStatusResult,
  CancelInvoiceInput, CancelInvoiceResult,
  CorrectInvoiceInput, CorrectInvoiceResult,
  DownloadFiscalDocumentInput, FiscalFileResult,
  CheckFiscalServiceInput, FiscalServiceStatusResult,
  CanonicalInvoiceStatus
} from "./contract";
import { buildFocusPayload } from "../transformers/focus";
import { resolveTax } from "../tax/resolve-tax";

function classifyFocusResult(responseStatus: number, responseData: any): {
  canonicalStatus: CanonicalInvoiceStatus;
  isRetryableError: boolean;
  errorCode: string;
} {
  // 2xx Success (Processing or Authorized)
  if (responseStatus >= 200 && responseStatus < 300) {
    if (responseData.status === "autorizado") {
      return { canonicalStatus: "authorized", isRetryableError: false, errorCode: "" };
    }
    if (responseData.status === "processando") {
      return { canonicalStatus: "processing", isRetryableError: false, errorCode: "" };
    }
    if (responseData.status === "erro_autorizacao" || responseData.status === "denegado") {
      return { canonicalStatus: "rejected", isRetryableError: false, errorCode: "SEFAZ_AUTHORIZATION_REJECTED" };
    }
    if (responseData.status === "cancelado") {
      return { canonicalStatus: "cancelled", isRetryableError: false, errorCode: "" };
    }
    return { canonicalStatus: "processing", isRetryableError: false, errorCode: "" };
  }

  // 4xx Client Errors (Validation, Auth, etc) - Never Retryable
  if (responseStatus === 401 || responseStatus === 403) {
    return { canonicalStatus: "error", isRetryableError: false, errorCode: "PROVIDER_AUTHENTICATION_ERROR" };
  }
  if (responseStatus === 415) {
    return { canonicalStatus: "error", isRetryableError: false, errorCode: "PROVIDER_PROTOCOL_ERROR" };
  }
  if (responseStatus >= 400 && responseStatus < 500) {
    return { canonicalStatus: "error", isRetryableError: false, errorCode: "PROVIDER_VALIDATION_ERROR" };
  }

  // 5xx Server Errors (Focus/SEFAZ Unavailable) - Retryable
  return { canonicalStatus: "error", isRetryableError: true, errorCode: "PROVIDER_TEMPORARILY_UNAVAILABLE" };
}

export class FocusNFeProvider implements FiscalProvider {
  private getBaseUrl(environment: "homologation" | "production"): string {
    return environment === "production" 
      ? "https://api.focusnfe.com.br"
      : "https://homologacao.focusnfe.com.br";
  }

  private getAuthHeader(token: string): Record<string, string> {
    if (!token) return { success: false, canonicalStatus: "error", errorCode: "FOCUS_CREDENTIALS_MISSING", isRetryableError: false, error: "Missing Focus NFe API Token" } as any;
    return {
      "Authorization": `Basic ${Buffer.from(token + ":").toString("base64")}`,
      "Content-Type": "application/json"
    };
  }
  
  generateReference(invoiceId: string): string {
    return "BRIDGE" + invoiceId.replace(/-/g, "").toUpperCase();
  }

  async issueInvoice(input: IssueInvoiceInput): Promise<IssueInvoiceResult> {
    try {
      const baseUrl = this.getBaseUrl(input.environment);
      const canonicalPayload = resolveTax(input.payload);
      const focusPayload = buildFocusPayload(canonicalPayload);
      const referenceId = input.providerReference || this.generateReference(input.invoiceId); 

      const controller = new AbortController();
      const timeoutMs = Math.min(Math.max(input.credentials?.requestTimeoutMs || 15000, 5000), 45000);
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs); 

            const token = input.credentials?.apiToken || process.env[input.credentials?.reference || "FOCUS_NFE_API_TOKEN"];
      if (!token) {
        return { success: false, canonicalStatus: "error", isRetryableError: false, errorCode: "FOCUS_CREDENTIALS_MISSING", error: "Credencial Focus NFe ausente no provedor." };
      }

      let response;
      try {
        response = await fetch(`${baseUrl}/v2/nfe?ref=${referenceId}`, {
          method: "POST",
          headers: this.getAuthHeader(token),
          body: JSON.stringify(focusPayload),
          signal: controller.signal
        });
      } catch (networkErr: any) {
        if (networkErr.name === "AbortError" || networkErr.code === "UND_ERR_CONNECT_TIMEOUT" || networkErr.code === "ECONNRESET") {
           return { 
             success: false, 
             canonicalStatus: "error", 
             isRetryableError: true, 
             errorCode: "FOCUS_SUBMISSION_OUTCOME_UNKNOWN", 
             recoveryStrategy: "status_check_first",
             error: "Conexão interrompida antes da resposta. Resultado da submissão é incerto." 
           };
        }
        return { success: false, canonicalStatus: "error", isRetryableError: true, errorCode: "NETWORK_ERROR", error: networkErr.message };
      } finally {
        clearTimeout(timeoutId);
      }

      const data = await response.json().catch(() => ({}));

      const classification = classifyFocusResult(response.status, data);

      if (classification.canonicalStatus === "error" || classification.canonicalStatus === "rejected") {
        return {
          success: false,
          canonicalStatus: classification.canonicalStatus,
          isRetryableError: classification.isRetryableError,
          errorCode: classification.errorCode,
          error: data.mensagem || data.codigo || "Erro Focus NFe",
          rawResponse: { http_status: response.status, provider_error_code: data.codigo, provider_message: data.mensagem }
        };
      }

      return {
        success: true,
        canonicalStatus: classification.canonicalStatus,
        providerStatus: data.status,
        providerReference: referenceId,
        accessKey: data.chave_nfe,
        authorizationProtocol: data.protocolo,
  authorizedAt: data.data_autorizacao,
        rawResponse: { http_status: response.status, provider_status: data.status, chave_nfe: data.chave_nfe, protocolo: data.protocolo, mensagem: data.mensagem ? String(data.mensagem).substring(0, 1000).replace(/[\x00-\x1F\x7F]/g, '') : undefined }
      };

    } catch (err: any) {
      return { success: false, canonicalStatus: "error", isRetryableError: false, errorCode: "INTERNAL_ADAPTER_ERROR", error: err.message };
    }
  }

  async getInvoiceStatus(input: GetInvoiceStatusInput): Promise<GetInvoiceStatusResult> {
    try {
      const baseUrl = this.getBaseUrl(input.environment);
      const referenceId = input.providerReference || this.generateReference(input.invoiceId);
      
      const controller = new AbortController();
      const timeoutMs = Math.min(Math.max(input.credentials?.requestTimeoutMs || 15000, 5000), 45000);
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

            const token = input.credentials?.apiToken || process.env[input.credentials?.reference || "FOCUS_NFE_API_TOKEN"];
      if (!token) {
        return { success: false, canonicalStatus: "error", isRetryableError: false, errorCode: "FOCUS_CREDENTIALS_MISSING", error: "Credencial Focus NFe ausente no provedor." };
      }

      let response;
      try {
        response = await fetch(`${baseUrl}/v2/nfe/${referenceId}?completa=1`, {
          method: "GET",
          headers: this.getAuthHeader(token),
          signal: controller.signal
        });
      } catch (networkErr: any) {
         if (networkErr.name === "AbortError") {
           return { success: false, canonicalStatus: "error", isRetryableError: true, errorCode: "PROVIDER_TIMEOUT", error: "Focus NFe API network timeout" };
         }
         return { success: false, canonicalStatus: "error", isRetryableError: true, errorCode: "NETWORK_ERROR", error: networkErr.message };
      } finally {
         clearTimeout(timeoutId);
      }

      const data = await response.json().catch(() => ({}));
      
      if (response.status === 404) {
        return { 
          success: false, 
          canonicalStatus: "error",
          isRetryableError: false,
          errorCode: "REFERENCE_NOT_FOUND",
          error: "Documento/Referência inexistente na Focus", 
          rawResponse: { http_status: 404 } 
        };
      }

      const classification = classifyFocusResult(response.status, data);

      if (classification.canonicalStatus === "error" || classification.canonicalStatus === "rejected") {
        return { 
          success: false, 
          canonicalStatus: classification.canonicalStatus,
          isRetryableError: classification.isRetryableError,
          errorCode: classification.errorCode,
          error: data.mensagem || "Erro na consulta Focus", 
          rawResponse: { http_status: response.status, provider_status: data.status, provider_message: (data.mensagem || data.mensagem_sefaz) ? String(data.mensagem || data.mensagem_sefaz).substring(0, 1000).replace(/[\x00-\x1F\x7F]/g, '') : undefined } 
        };
      }

      return {
        success: true,
        canonicalStatus: classification.canonicalStatus,
        providerStatus: data.status,
        accessKey: data.chave_nfe,
        authorizationProtocol: data.protocolo,
  authorizedAt: data.data_autorizacao,
        rawResponse: { http_status: response.status, provider_status: data.status, provider_message: data.mensagem_sefaz ? String(data.mensagem_sefaz).substring(0, 1000).replace(/[\x00-\x1F\x7F]/g, '') : undefined }
      };
    } catch (err: any) {
      return { success: false, canonicalStatus: "error", isRetryableError: false, errorCode: "INTERNAL_ADAPTER_ERROR", error: err.message };
    }
  }

  async cancelInvoice(input: CancelInvoiceInput): Promise<CancelInvoiceResult> {
    return { success: false, canonicalStatus: "error", error: "NOT_IMPLEMENTED" };
  }

  async correctInvoice(input: CorrectInvoiceInput): Promise<CorrectInvoiceResult> {
    return { success: false, error: "NOT_IMPLEMENTED" };
  }

  async downloadXml(input: DownloadFiscalDocumentInput): Promise<FiscalFileResult> {
    return { success: false, error: "NOT_IMPLEMENTED" };
  }

  async downloadDanfe(input: DownloadFiscalDocumentInput): Promise<FiscalFileResult> {
    return { success: false, error: "NOT_IMPLEMENTED" };
  }

  async checkServiceStatus(input: CheckFiscalServiceInput): Promise<FiscalServiceStatusResult> {
    return { online: true, message: "Ping ok" };
  }
}






