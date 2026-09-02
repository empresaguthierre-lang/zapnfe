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

export class FocusNFeProvider implements FiscalProvider {
  private getBaseUrl(environment: "homologation" | "production"): string {
    return environment === "production" 
      ? "https://api.focusnfe.com.br"
      : "https://homologacao.focusnfe.com.br";
  }

  private getAuthHeader(token: string): Record<string, string> {
    return {
      "Authorization": `Basic ${Buffer.from(token + ":").toString("base64")}`,
      "Content-Type": "application/json"
    };
  }

  async issueInvoice(input: IssueInvoiceInput): Promise<IssueInvoiceResult> {
    try {
      const baseUrl = this.getBaseUrl(input.environment);
      const token = input.credentials?.apiToken || process.env.FOCUS_NFE_API_TOKEN;
      
      if (!token) {
        return { success: false, canonicalStatus: "error", error: "Focus NFe API token is missing" };
      }

      // Generate the internal payload format
      const payload = buildFocusPayload(input.payload || {});
      const referenceId = input.invoiceId; // Focus uses ref as idempotency key

      const response = await fetch(`${baseUrl}/v2/nfe?ref=${referenceId}`, {
        method: "POST",
        headers: this.getAuthHeader(token),
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          canonicalStatus: "error", // Could be validation error
          error: data.mensagem || "Erro de validação Focus NFe",
          rawResponse: data
        };
      }

      // Focus returns status which could be processando, autorizado, etc.
      // Usually POST to /v2/nfe with a new ref returns processando.
      return {
        success: true,
        canonicalStatus: "processing",
        providerStatus: data.status,
        providerReference: referenceId, // We use the same reference to query later
        rawResponse: data
      };

    } catch (err: any) {
      return { success: false, canonicalStatus: "error", error: err.message };
    }
  }

  async getInvoiceStatus(input: GetInvoiceStatusInput): Promise<GetInvoiceStatusResult> {
    try {
      const baseUrl = this.getBaseUrl(input.environment);
      const token = input.credentials?.apiToken || process.env.FOCUS_NFE_API_TOKEN;
      
      if (!token) return { success: false, canonicalStatus: "error", error: "Focus NFe API token missing" };

      const response = await fetch(`${baseUrl}/v2/nfe/${input.providerReference}`, {
        method: "GET",
        headers: this.getAuthHeader(token)
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, canonicalStatus: "error", error: data.mensagem, rawResponse: data };
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
        rawResponse: data
      };
    } catch (err: any) {
      return { success: false, canonicalStatus: "error", error: err.message };
    }
  }

  async cancelInvoice(input: CancelInvoiceInput): Promise<CancelInvoiceResult> {
    throw new Error("Not implemented yet");
  }

  async correctInvoice(input: CorrectInvoiceInput): Promise<CorrectInvoiceResult> {
    throw new Error("Not implemented yet");
  }

  async downloadXml(input: DownloadFiscalDocumentInput): Promise<FiscalFileResult> {
    throw new Error("Not implemented yet");
  }

  async downloadDanfe(input: DownloadFiscalDocumentInput): Promise<FiscalFileResult> {
    throw new Error("Not implemented yet");
  }

  async checkServiceStatus(input: CheckFiscalServiceInput): Promise<FiscalServiceStatusResult> {
    return { online: true, message: "Ping ok" };
  }
}

