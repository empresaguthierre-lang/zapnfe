import { 
  FiscalProvider, 
  IssueInvoiceInput, IssueInvoiceResult,
  GetInvoiceStatusInput, GetInvoiceStatusResult,
  CancelInvoiceInput, CancelInvoiceResult,
  CorrectInvoiceInput, CorrectInvoiceResult,
  DownloadFiscalDocumentInput, FiscalFileResult,
  CheckFiscalServiceInput, FiscalServiceStatusResult
} from "./contract";
import { buildFocusPayload } from "../transformers/focus";
import { resolveTax } from "../tax/resolve-tax";

export class FocusNFeProvider implements FiscalProvider {
  private getBaseUrl(environment: "homologation" | "production"): string {
    return environment === "production" 
      ? "https://api.focusnfe.com.br"
      : "https://homologacao.focusnfe.com.br";
  }

  private getAuthHeader(token: string): Record<string, string> {
    if (!token) throw new Error("Missing Focus NFe API Token");
    // HTTP Basic Auth: username = token, password = empty
    return {
      "Authorization": `Basic ${Buffer.from(token + ":").toString("base64")}`,
      "Content-Type": "application/json"
    };
  }
  
  private formatReference(invoiceId: string): string {
    return "BRIDGE" + invoiceId.replace(/-/g, "").toUpperCase();
  }

  async issueInvoice(input: IssueInvoiceInput): Promise<IssueInvoiceResult> {
    try {
      const baseUrl = this.getBaseUrl(input.environment);
      
      // 1. Resolve Tax -> Canonical Model
      const canonicalPayload = resolveTax(input.payload);
      
      // 2. Transformer -> Focus JSON
      const focusPayload = buildFocusPayload(canonicalPayload);
      
      // 3. Idempotency Key
      const referenceId = this.formatReference(input.invoiceId); 

      // 4. Request with timeout setup (fetch does not have native timeout, using AbortController)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

      const token = input.credentials?.apiToken || process.env[input.credentials?.reference || "FOCUS_NFE_API_TOKEN"];

      let response;
      try {
        response = await fetch(`${baseUrl}/v2/nfe?ref=${referenceId}`, {
          method: "POST",
          headers: this.getAuthHeader(token),
          body: JSON.stringify(focusPayload),
          signal: controller.signal
        });
      } catch (networkErr: any) {
        if (networkErr.name === "AbortError") {
           throw new Error("Focus NFe API network timeout");
        }
        throw networkErr;
      } finally {
        clearTimeout(timeoutId);
      }

      const data = await response.json();

      // Normalize errors
      if (!response.ok) {
        // e.g. 400 Bad Request -> Validation error (Not retryable, should fail the invoice)
        // 401 Unauthorized -> Configuration error (Not retryable automatically)
        // 5xx Server Error -> Focus NFe is down (Retryable)
        const isClientError = response.status >= 400 && response.status < 500;
        
        return {
          success: false,
          canonicalStatus: isClientError ? "rejected" : "error",
          error: data.mensagem || "Erro Focus NFe",
          rawResponse: { http_status: response.status, provider_error_code: data.codigo, provider_message: data.mensagem }
        };
      }

      // Focus returns status which could be processando, autorizado, etc.
      // Usually POST to /v2/nfe with a new ref returns processando.
      return {
        success: true,
        canonicalStatus: "processing",
        providerStatus: data.status,
        providerReference: referenceId, 
        rawResponse: { http_status: response.status, provider_status: data.status }
      };

    } catch (err: any) {
      return { success: false, canonicalStatus: "error", error: err.message };
    }
  }

  async getInvoiceStatus(input: GetInvoiceStatusInput): Promise<GetInvoiceStatusResult> {
    try {
      const baseUrl = this.getBaseUrl(input.environment);
      const referenceId = input.providerReference || this.formatReference(input.invoiceId);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const token = input.credentials?.apiToken || process.env[input.credentials?.reference || "FOCUS_NFE_API_TOKEN"];

      let response;
      try {
        response = await fetch(`${baseUrl}/v2/nfe/${referenceId}`, {
          method: "GET",
          headers: this.getAuthHeader(token),
          signal: controller.signal
        });
      } catch (networkErr: any) {
         if (networkErr.name === "AbortError") throw new Error("Focus NFe API network timeout");
         throw networkErr;
      } finally {
         clearTimeout(timeoutId);
      }

      const data = await response.json();

      if (!response.ok) {
        return { 
          success: false, 
          canonicalStatus: "error", 
          error: data.mensagem || "Erro na consulta Focus", 
          rawResponse: { http_status: response.status, provider_message: data.mensagem } 
        };
      }

      const statusMap: Record<string, "processing" | "authorized" | "rejected" | "cancelled" | "error"> = {
        "processando": "processing",
        "autorizado": "authorized",
        "erro_autorizacao": "rejected",
        "denegado": "rejected",
        "cancelado": "cancelled"
      };

      const canonicalStatus = statusMap[data.status] || "error";

      return {
        success: true,
        canonicalStatus,
        providerStatus: data.status,
        accessKey: data.chave_nfe,
        authorizationProtocol: data.protocolo,
        rawResponse: { http_status: response.status, provider_status: data.status, provider_message: data.mensagem_sefaz }
      };
    } catch (err: any) {
      return { success: false, canonicalStatus: "error", error: err.message };
    }
  }

  async cancelInvoice(input: CancelInvoiceInput): Promise<CancelInvoiceResult> {
    return { success: false, canonicalStatus: "error", error: "NOT_IMPLEMENTED" };
  }

  async correctInvoice(input: CorrectInvoiceInput): Promise<CorrectInvoiceResult> {
    return { success: false, canonicalStatus: "error", error: "NOT_IMPLEMENTED" };
  }

  async downloadXml(input: DownloadFiscalDocumentInput): Promise<FiscalFileResult> {
    return { success: false, error: "NOT_IMPLEMENTED", contentType: "application/xml", fileData: "" };
  }

  async downloadDanfe(input: DownloadFiscalDocumentInput): Promise<FiscalFileResult> {
    return { success: false, error: "NOT_IMPLEMENTED", contentType: "application/pdf", fileData: "" };
  }

  async checkServiceStatus(input: CheckFiscalServiceInput): Promise<FiscalServiceStatusResult> {
    return { online: true, message: "Ping ok" };
  }
}


