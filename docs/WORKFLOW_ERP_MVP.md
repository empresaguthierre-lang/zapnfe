# Workflow Bridge ERP (MVP)

## Fases Concluídas
- **Blocos Iniciais:** Modelagem base, CRM, Produtos, Estoque (Livro de Movimentações, Estornos), Roles.
- **Bloco 3 (Financeiro):** Motor financeiro, Contas a Receber, Rateio Inteligente, Status Sincronizado, Transações Bancárias (Block 3C).
- **Bloco 4A (Fiscal Foundation):**
  - Motor genérico de restrições de clientes (get/assert).
  - Imutabilidade (Invoice Snapshots).
  - Draft Determinístico (hash versioning, zero side-effects).
  - Readiness Engine.
- **Bloco P0.1 (Engineering Constitution):** 
  - Regras rígidas de segurança aplicadas (SET search_path, RLS, no-DELETE).
  - Documentação Oficial em `docs/`.
- **Bloco 4B (Fiscal Provider Abstraction):**
  - Outbox Pattern (jobs, locking, RPC de fila segura).
  - Canonical Status Mapping.
  - TS Contracts (FiscalProvider, ProviderFactory).
  - Ambiente mock determinístico (TestProvider).
  - Isolamento Homologação vs Produção.

## Próximo Passo
- **Bloco 4C (Provedor Fiscal Real):**
  - Implementar `FocusNFeProvider` ou similar.
  - Testar fluxo End-to-End no ambiente de homologação real da SEFAZ.
  - Implementar Worker/Cron Job para processar fila Outbox.
  - Webhooks do Provedor para registrar a autorização final.
  - Gatilho: NF Autorizada -> Baixa Reserva de Estoque -> Atualiza Financeiro.
