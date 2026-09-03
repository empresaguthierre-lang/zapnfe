import { 
  FiscalProvider, 
  IssueInvoiceInput, IssueInvoiceResult,
  GetInvoiceStatusInput, GetInvoiceStatusResult,
  CancelInvoiceInput, CancelInvoiceResult,
  CorrectInvoiceInput, CorrectInvoiceResult,
  DownloadFiscalDocumentInput, FiscalFileResult,
  CheckFiscalServiceInput, FiscalServiceStatusResult
} from './contract';

/**
 * Test Provider (Deterministic Mock)
 * Used to prove our architecture without touching SEFAZ or real providers.
 */
export class TestFiscalProvider implements FiscalProvider {
  
  generateReference(invoiceId: string): string { return "TEST" + invoiceId.replace(/-/g, "").toUpperCase(); }
  async issueInvoice(input: IssueInvoiceInput): Promise<IssueInvoiceResult> {
    const latency = input.credentials?.latencyMs ?? 800;
    if (latency > 0) await new Promise(r => setTimeout(r, latency));
    
    // Deterministic mock logic based on environment
    if (input.environment === 'production') {
      return {
        success: false,
        providerStatus: 'forbidden',
        canonicalStatus: 'error',
        rawResponse: { error: 'TestProvider refuses to run in production.' },
        error: 'TestProvider cannot run in production.'
      };
    }
    
    return {
      success: true,
      providerStatus: 'processing',
      canonicalStatus: 'processing',
      providerReference: `test_ref_${Date.now()}`,
      rawResponse: { message: 'Received by Test SEFAZ queue' }
    };
  }

  async getInvoiceStatus(input: GetInvoiceStatusInput): Promise<GetInvoiceStatusResult> {
    if ((input.credentials?.latencyMs ?? 400) > 0) await new Promise(r => setTimeout(r, input.credentials?.latencyMs ?? 400));
    
    // Always returns authorized for tests
    return {
      success: true,
      providerStatus: 'autorizado',
      canonicalStatus: 'authorized',
      accessKey: '35260112345678901234550010000000011000000019',
      authorizationProtocol: `TEST-PROT-${Date.now()}`,
      authorizedAt: new Date().toISOString(),
      rawResponse: { cStat: 100, xMotivo: 'Autorizado o uso da NF-e' }
    };
  }

  async cancelInvoice(input: CancelInvoiceInput): Promise<CancelInvoiceResult> {
    if ((input.credentials?.latencyMs ?? 600) > 0) await new Promise(r => setTimeout(r, input.credentials?.latencyMs ?? 600));
    return {
      success: true,
      providerStatus: 'cancelado',
      canonicalStatus: 'cancelled',
      cancellationProtocol: `TEST-CANC-${Date.now()}`,
      rawResponse: { cStat: 135, xMotivo: 'Evento registrado e vinculado a NF-e' }
    };
  }

  async correctInvoice(input: CorrectInvoiceInput): Promise<CorrectInvoiceResult> {
    if ((input.credentials?.latencyMs ?? 600) > 0) await new Promise(r => setTimeout(r, input.credentials?.latencyMs ?? 600));
    return {
      success: true,
      providerStatus: 'carta_correcao_registrada',
      correctionProtocol: `TEST-CC-${Date.now()}`,
      rawResponse: { cStat: 135, xMotivo: 'Evento registrado e vinculado a NF-e' }
    };
  }

  async downloadXml(input: DownloadFiscalDocumentInput): Promise<FiscalFileResult> {
    return {
      success: true,
      fileData: '<nfe><mock>true</mock></nfe>',
      contentType: 'application/xml'
    };
  }

  async downloadDanfe(input: DownloadFiscalDocumentInput): Promise<FiscalFileResult> {
    return {
      success: true,
      fileData: 'PDF_MOCK_DATA',
      contentType: 'application/pdf'
    };
  }

  async checkServiceStatus(input: CheckFiscalServiceInput): Promise<FiscalServiceStatusResult> {
    return {
      online: true,
      avgResponseTimeMs: 45,
      message: 'Test SEFAZ is online'
    };
  }
}
