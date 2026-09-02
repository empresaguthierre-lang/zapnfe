# BRIDGE ERP — GATE FISCAL 4C.1

**Versão**: `fiscal-4c1-homologation-rc1`
**Commit**: `c1388bbb7caece839d6787f8c9d09a0144318143`
**Data**: 02/09/2026
**Ambiente Focus**: Homologação

## Pré-requisitos (Ambiente)
- [ ] Focus homologação
- [ ] Credencial via secret
- [ ] Organização correta
- [ ] Filial correta
- [ ] Worker ativo

Cenário 1 — Autorização
- [ ] Executado
- [ ] invoice authorized
- [ ] access_key
- [ ] protocol
- [ ] eventos corretos

Cenário 2 — Rejeição SEFAZ
- [ ] Executado
- [ ] rejected
- [ ] código registrado
- [ ] sem retry

Cenário 3 — Falha técnica
- [ ] Executado
- [ ] retryable
- [ ] backoff
- [ ] recuperação

Cenário 4 — Idempotência
- [ ] Executado
- [ ] mesma ref
- [ ] nenhuma NF duplicada

Cenário 5 — Multi-tenant
- [ ] Executado
- [ ] acesso cruzado bloqueado

Cenário 6 — Resultado incerto
- [ ] timeout após submissão
- [ ] consulta pela ref
- [ ] nenhuma duplicidade

## Invariantes Fiscais
A homologação fiscal não pode alterar acidentalmente dados paralelos:
- Estoque físico: INALTERADO
- Estoque reservado: INALTERADO
- Financeiro (contas a receber): INALTERADO
- Pagamentos: INALTERADO

