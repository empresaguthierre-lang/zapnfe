# Homologação 4C.1 - Focus NFe

Versão: iscal-4c1-homologation-rc1
Commit: $sha
Data: 03/09/2026
Ambiente: Homologação Sefaz via Focus NFe

## Cenários de Homologação

1. **Emissão Padrão Completa (Tudo Verde)** - Sucesso esperado, com retorno uthorized.
2. **Rejeição por Tributação (NCM/CFOP incompatível)** - Deve capturar ejected e exibir falha semântica de ICMS.
3. **Rejeição por Regras de Negócio (CNPJ inexistente)** - Deve classificar como error não retentável (PROVIDER_VALIDATION_ERROR).
4. **Resiliência: Timeout na Sefaz** - Focus processa em Lote, Outbox deve fazer pooling (status processing).
5. **Autenticação Falha** - Chave da Focus errada, deve classificar PROVIDER_AUTHENTICATION_ERROR (sem repetições acidentais).
6. **Desastre: Queda de Conexão no POST (Idempotência)** - POST é enviado à Focus, internet cai. Ao rodar ecover_submission, o sistema resgata a NF-e existente via GET /v2/nfe/{ref} sem duplicar nota na Sefaz.
