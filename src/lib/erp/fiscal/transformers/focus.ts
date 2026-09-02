import { CanonicalFiscalPayload } from "../tax/resolve-tax";

export function buildFocusPayload(canonical: CanonicalFiscalPayload): any {
  // Translate canonical Bridge payload exactly to Focus NFe fields
  
  const payload: any = {
    natureza_operacao: canonical.natureza_operacao,
    data_emissao: canonical.data_emissao,
    tipo_documento: canonical.tipo_documento === "saida" ? "1" : "0",
    finalidade_emissao: canonical.finalidade_emissao === "normal" ? "1" : "2",
    
    // Emitente
    cnpj_emitente: canonical.emitente.cnpj,
    nome_emitente: canonical.emitente.nome,
    nome_fantasia_emitente: canonical.emitente.nome_fantasia,
    logradouro_emitente: canonical.emitente.logradouro,
    numero_emitente: canonical.emitente.numero,
    bairro_emitente: canonical.emitente.bairro,
    municipio_emitente: canonical.emitente.municipio,
    uf_emitente: canonical.emitente.uf,
    cep_emitente: canonical.emitente.cep,
    inscricao_estadual_emitente: canonical.emitente.inscricao_estadual,

    // Destinatário
    nome_destinatario: canonical.destinatario.nome,
    cnpj_destinatario: canonical.destinatario.cnpj_cpf?.length > 11 ? canonical.destinatario.cnpj_cpf : undefined,
    cpf_destinatario: canonical.destinatario.cnpj_cpf?.length <= 11 ? canonical.destinatario.cnpj_cpf : undefined,
    logradouro_destinatario: canonical.destinatario.logradouro,
    numero_destinatario: canonical.destinatario.numero,
    bairro_destinatario: canonical.destinatario.bairro,
    municipio_destinatario: canonical.destinatario.municipio,
    uf_destinatario: canonical.destinatario.uf,
    cep_destinatario: canonical.destinatario.cep,
    indicador_inscricao_estadual_destinatario: canonical.destinatario.indicador_inscricao_estadual,
    inscricao_estadual_destinatario: canonical.destinatario.inscricao_estadual,
    
    // Itens
    itens: canonical.itens.map((item) => ({
      numero_item: item.numero_item,
      codigo_produto: item.codigo_produto,
      descricao: item.descricao,
      cfop: item.cfop,
      unidade_comercial: item.unidade_comercial,
      quantidade_comercial: item.quantidade_comercial,
      valor_unitario_comercial: item.valor_unitario_comercial,
      valor_bruto: item.valor_bruto,
      codigo_ncm: item.ncm,
      icms_situacao_tributaria: item.icms_situacao_tributaria,
      icms_origem: item.icms_origem,
      pis_situacao_tributaria: item.pis_situacao_tributaria,
      cofins_situacao_tributaria: item.cofins_situacao_tributaria,
    })),

    // Totais e Frete
    modalidade_frete: canonical.frete.modalidade,
    valor_frete: canonical.frete.valor,
    valor_seguro: canonical.valor_seguro,
    valor_produtos: canonical.valor_produtos,
    valor_total: canonical.valor_total,
  };

  return payload;
}

