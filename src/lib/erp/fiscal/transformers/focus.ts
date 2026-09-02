export function buildFocusPayload(invoice: any): any {
  // Focus NFe expects a specific JSON format based on their documentation.
  // We will map our internal invoice snapshot to their format.
  
  const payload: any = {
    natureza_operacao: invoice.natureza_operacao || "Venda de mercadoria",
    data_emissao: invoice.data_emissao || new Date().toISOString(),
    tipo_documento: "1", // 1 = Saída
    finalidade_emissao: "1", // 1 = Normal
    cnpj_emitente: invoice.cnpj_emitente, // Must be registered in Focus
    nome_emitente: invoice.nome_emitente,
    nome_fantasia_emitente: invoice.nome_fantasia_emitente,
    logradouro_emitente: invoice.logradouro_emitente,
    numero_emitente: invoice.numero_emitente,
    bairro_emitente: invoice.bairro_emitente,
    municipio_emitente: invoice.municipio_emitente,
    uf_emitente: invoice.uf_emitente,
    cep_emitente: invoice.cep_emitente,
    inscricao_estadual_emitente: invoice.inscricao_estadual_emitente,

    // Destinatário
    nome_destinatario: invoice.buyer_name,
    cnpj_destinatario: invoice.buyer_document?.length > 11 ? invoice.buyer_document : undefined,
    cpf_destinatario: invoice.buyer_document?.length <= 11 ? invoice.buyer_document : undefined,
    logradouro_destinatario: invoice.buyer_address_street,
    numero_destinatario: invoice.buyer_address_number,
    bairro_destinatario: invoice.buyer_address_neighborhood,
    municipio_destinatario: invoice.buyer_address_city,
    uf_destinatario: invoice.buyer_address_state,
    cep_destinatario: invoice.buyer_address_zip,
    indicador_inscricao_estadual_destinatario: invoice.buyer_state_registration ? "1" : "9",
    inscricao_estadual_destinatario: invoice.buyer_state_registration,
    
    // Itens
    itens: invoice.items?.map((item: any, index: number) => ({
      numero_item: index + 1,
      codigo_produto: item.product_code || item.product_id,
      descricao: item.product_name,
      cfop: item.cfop || "5102", // Default for internal state sales if not set
      unidade_comercial: item.unit || "UN",
      quantidade_comercial: item.quantity,
      valor_unitario_comercial: item.unit_price,
      valor_bruto: item.total_price,
      codigo_ncm: item.ncm || "00000000",
      
      // Tributação (Simples Nacional by default, CSOSN 102 - without tax credit)
      icms_situacao_tributaria: item.csosn || "102",
      icms_origem: item.origin || "0",
      pis_situacao_tributaria: "07", // Isento / Não Tributado
      cofins_situacao_tributaria: "07",
    })) || [],

    valor_frete: invoice.freight_value || 0,
    valor_seguro: invoice.insurance_value || 0,
    valor_total: invoice.total_value,
    valor_produtos: invoice.items_total_value,
    
    // Frete
    modalidade_frete: invoice.freight_modality || "9", // 9 = Sem Frete
  };

  return payload;
}

