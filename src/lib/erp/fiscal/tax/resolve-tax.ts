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
  // In a complete ERP, this reads the organization tax regime (Simples vs Normal),
  // state (UF) of origin and destination, and product fiscal profiles.
  
  // Hardcoded simple tax resolution for the MVP:
  const isSimplesNacional = true;
  const originState = invoiceSnapshot.uf_emitente || "SP";
  const destState = invoiceSnapshot.buyer_address_state || "SP";
  const isInterstate = originState !== destState;

  const resolvedItems = (invoiceSnapshot.items || []).map((item: any, index: number): CanonicalFiscalItem => {
    // Determine CFOP
    let cfop = item.cfop;
    if (!cfop) {
      cfop = isInterstate ? "6102" : "5102"; // Venda de mercadoria adquirida ou recebida de terceiros
    }

    return {
      numero_item: index + 1,
      codigo_produto: item.product_code || item.product_id,
      descricao: item.product_name || "Produto Genérico",
      ncm: item.ncm || "00000000",
      cfop,
      unidade_comercial: item.unit || "UN",
      quantidade_comercial: item.quantity,
      valor_unitario_comercial: item.unit_price,
      valor_bruto: item.total_price,
      // Tax regime rules
      icms_situacao_tributaria: isSimplesNacional ? (item.csosn || "102") : (item.cst || "00"),
      icms_origem: item.origin || "0",
      pis_situacao_tributaria: "07", // Operação Isenta
      cofins_situacao_tributaria: "07",
    };
  });

  return {
    natureza_operacao: invoiceSnapshot.natureza_operacao || "Venda de mercadoria",
    data_emissao: invoiceSnapshot.data_emissao || new Date().toISOString(),
    tipo_documento: "saida",
    finalidade_emissao: "normal",
    
    emitente: {
      cnpj: invoiceSnapshot.cnpj_emitente,
      nome: invoiceSnapshot.nome_emitente,
      nome_fantasia: invoiceSnapshot.nome_fantasia_emitente,
      logradouro: invoiceSnapshot.logradouro_emitente,
      numero: invoiceSnapshot.numero_emitente,
      bairro: invoiceSnapshot.bairro_emitente,
      municipio: invoiceSnapshot.municipio_emitente,
      uf: invoiceSnapshot.uf_emitente,
      cep: invoiceSnapshot.cep_emitente,
      inscricao_estadual: invoiceSnapshot.inscricao_estadual_emitente,
    },

    destinatario: {
      nome: invoiceSnapshot.buyer_name,
      cnpj_cpf: invoiceSnapshot.buyer_document,
      logradouro: invoiceSnapshot.buyer_address_street,
      numero: invoiceSnapshot.buyer_address_number,
      bairro: invoiceSnapshot.buyer_address_neighborhood,
      municipio: invoiceSnapshot.buyer_address_city,
      uf: invoiceSnapshot.buyer_address_state,
      cep: invoiceSnapshot.buyer_address_zip,
      indicador_inscricao_estadual: invoiceSnapshot.buyer_state_registration ? "1" : "9",
      inscricao_estadual: invoiceSnapshot.buyer_state_registration,
    },

    itens: resolvedItems,

    frete: {
      modalidade: invoiceSnapshot.freight_modality || "9",
      valor: invoiceSnapshot.freight_value || 0,
    },
    valor_seguro: invoiceSnapshot.insurance_value || 0,
    valor_produtos: invoiceSnapshot.items_total_value,
    valor_total: invoiceSnapshot.total_value,
  };
}

