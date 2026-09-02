export interface CanonicalFiscalItem {
  numero_item: number;
  codigo_produto: string;
  descricao: string;
  ncm: string;
  cfop: string;
  unidade_comercial: string;
  quantidade_comercial: number;
  valor_unitario_comercial: number;
  valor_bruto: number;
  icms_situacao_tributaria: string;
  icms_origem: string;
  pis_situacao_tributaria: string;
  cofins_situacao_tributaria: string;
}

export interface CanonicalFiscalPayload {
  natureza_operacao: string;
  data_emissao: string;
  tipo_documento: "entrada" | "saida";
  finalidade_emissao: "normal" | "complementar" | "ajuste" | "devolucao";
  
  emitente: {
    cnpj: string;
    nome: string;
    nome_fantasia: string;
    logradouro: string;
    numero: string;
    bairro: string;
    municipio: string;
    uf: string;
    cep: string;
    inscricao_estadual: string;
  };
  
  destinatario: {
    nome: string;
    cnpj_cpf: string;
    logradouro: string;
    numero: string;
    bairro: string;
    municipio: string;
    uf: string;
    cep: string;
    indicador_inscricao_estadual: "1" | "2" | "9";
    inscricao_estadual?: string;
  };

  itens: CanonicalFiscalItem[];

  frete: {
    modalidade: "0" | "1" | "2" | "3" | "4" | "9"; // 9 = sem frete
    valor: number;
  };

  valor_seguro: number;
  valor_produtos: number;
  valor_total: number;
}

export function resolveTax(invoiceSnapshot: any): CanonicalFiscalPayload {
  // Extract JSONB addresses (falling back to empty objects if missing)
  const issuerAddress = invoiceSnapshot.issuer_address_snapshot || {};
  const recipientAddress = invoiceSnapshot.recipient_address_snapshot || {};

  const isSimplesNacional = invoiceSnapshot.issuer_tax_regime_snapshot === "simples_nacional" || true;
  const originState = issuerAddress.state || "SP";
  const destState = recipientAddress.state || "SP";
  const isInterstate = originState !== destState;

  const resolvedItems = (invoiceSnapshot.invoice_items || []).map((item: any, index: number): CanonicalFiscalItem => {
    // Note: invoice_items table uses product_name_snapshot, unit_price_snapshot, etc.
    let cfop = item.cfop_snapshot;
    if (!cfop) {
      cfop = isInterstate ? "6102" : "5102"; // Venda de mercadoria adquirida ou recebida de terceiros
    }

    return {
      numero_item: index + 1,
      codigo_produto: item.product_id,
      descricao: item.product_name_snapshot || "Produto Generico",
      ncm: item.ncm_snapshot || "00000000",
      cfop,
      unidade_comercial: item.unit_snapshot || "UN",
      quantidade_comercial: item.quantity,
      valor_unitario_comercial: item.unit_price_snapshot,
      valor_bruto: item.total_price_snapshot,
      // Tax regime rules
      icms_situacao_tributaria: isSimplesNacional ? (item.csosn_snapshot || "102") : (item.cst_snapshot || "00"),
      icms_origem: item.origin_snapshot || "0",
      pis_situacao_tributaria: "07", // Operacao Isenta
      cofins_situacao_tributaria: "07",
    };
  });

  return {
    natureza_operacao: invoiceSnapshot.operation_nature || "Venda de mercadoria",
    data_emissao: invoiceSnapshot.issued_at || new Date().toISOString(),
    tipo_documento: "saida",
    finalidade_emissao: "normal",
    
    emitente: {
      cnpj: invoiceSnapshot.issuer_cnpj_snapshot,
      nome: invoiceSnapshot.issuer_legal_name_snapshot,
      nome_fantasia: invoiceSnapshot.issuer_trade_name_snapshot || invoiceSnapshot.issuer_legal_name_snapshot,
      logradouro: issuerAddress.street,
      numero: issuerAddress.number,
      bairro: issuerAddress.neighborhood,
      municipio: issuerAddress.city,
      uf: issuerAddress.state,
      cep: issuerAddress.zip,
      inscricao_estadual: invoiceSnapshot.issuer_ie_snapshot,
    },

    destinatario: {
      nome: invoiceSnapshot.recipient_name_snapshot,
      cnpj_cpf: invoiceSnapshot.recipient_document_snapshot,
      logradouro: recipientAddress.street,
      numero: recipientAddress.number,
      bairro: recipientAddress.neighborhood,
      municipio: recipientAddress.city,
      uf: recipientAddress.state,
      cep: recipientAddress.zip,
      indicador_inscricao_estadual: invoiceSnapshot.recipient_ie_indicator_snapshot || (invoiceSnapshot.recipient_ie_snapshot ? "1" : "9"),
      inscricao_estadual: invoiceSnapshot.recipient_ie_snapshot,
    },

    itens: resolvedItems,

    frete: {
      modalidade: invoiceSnapshot.freight_modality || "9",
      valor: invoiceSnapshot.freight_value || 0,
    },
    valor_seguro: invoiceSnapshot.insurance_value || 0,
    valor_produtos: invoiceSnapshot.items_total_value || 0,
    valor_total: invoiceSnapshot.total_value || 0,
  };
}

