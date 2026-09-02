# ERP Engineering Standards

Padrões de engenharia para desenvolvimento e manutenção.

## 1. Migrations são Imutáveis

Migration já aplicada **nunca** é editada.
Qualquer correção exige uma **nova migration**.
O nome deve ser claro: `20260902xxxxxx_harden_banking_rpcs.sql`. Proibido: `fix.sql`.

## 2. UTF-8 Obrigatório

Todos os arquivos (`.ts`, `.tsx`, `.sql`, `.md`, `.json`) devem ser codificados em UTF-8 estrito.
Scripts de pipeline não podem corromper caracteres acentuados.

## 3. Server Actions Pequenas

Server Action deve apenas: fazer parse de input, auth, chamar RPC/use-case, mapear erro, revalidate, retornar.
Proibido: colocar 400 linhas de regra de estoque, financeiro ou fiscal dentro do Server Action.

## 4. Regra de RPC Crítica

Toda RPC que altera estado importante deve seguir esta ordem:
1. Validar parâmetros básicos
2. Buscar entidade raiz e obter *locks* (FOR UPDATE)
3. Resolver `organization_id` real
4. Validar membership e roles
5. Validar concorrência/idempotência
6. Executar a mudança
7. Atualizar read-models
8. Registrar evento (audit/business)
9. COMMIT

## 5. Idempotência e Concorrência

- **Concorrência:** Operações críticas devem usar lock (`FOR UPDATE`) ou optimistic concurrency. Locks múltiplos devem ser sempre feitos em ordem determinística (ex: `ORDER BY id`) para evitar deadlocks.
- **Idempotência:** Operações com retry (criar draft, pagar, gerar nf) precisam garantir idempotência via chave, constraint natural ou snapshot hash. Nunca confie no "botão desabilitado" da UI.

## 6. Regra de Erros

A RPC lança/retorna um código estável (ex: `CUSTOMER_OPERATION_BLOCKED`).
O Frontend traduz para mensagem humana.
Nunca controlar lógica baseada no texto da mensagem de erro (`if (msg.includes("falha"))`).

## 7. O Frontend mostra, coleta e organiza

O Frontend NÃO decide regras críticas.
Ele recebe diagnósticos via Queries (ex: `fiscal_validate_order_readiness()`) e renderiza. Não calcula se "pode faturar" checando os dados na mão.

## 8. Queries e Commands separados

- **Query** (get/validate): Não muda estado. Retorna diagnóstico/dados.
- **Command** (apply/assert/create): Muda estado ou bloqueia execução.
*Exemplo fiscal:* `fiscal_validate_order_readiness()` (Query) vs `fiscal_assert_order_readiness()` (Command).

## 9. Sem Mocks Operacionais

Proibido dados `fake` (`Math.random()`, `428291.00`) em rotas operacionais (ex: `/financeiro`, `/estoque`). Use estado vazio real ("Nenhuma movimentação").

## 10. Índices e Performance

Todo novo filtro crítico deve vir acompanhado da pergunta: "Qual índice sustentará isso com 1 milhão de linhas?"
Sempre prefixar índices de queries tenant com `organization_id`.
Não usar `SELECT *` na UI. Selecione apenas os campos necessários.

## 11. Testes Obrigatórios

Toda regressão grave descoberta ganha um teste permanente.
**Teste Multi-Tenant é obrigatório:** Testar se Org A vê Org B. Deve resultar em `NOT_FOUND` ou `UNAUTHORIZED`. Erros não podem vazar dados de existência ("Fatura da empresa B").

## 12. Definition of Done (Gate de CI)

Nenhum bloco é "DONE" só porque o build passou.
Requisitos:
[ ] Migration nova (sem alterar antigas)
[ ] RLS e Membership validados
[ ] Roles aplicadas
[ ] SECURITY DEFINER hardened
[ ] Idempotência e Concorrência analisadas
[ ] Índices criados
[ ] Audit e Business Events gerados
[ ] Error codes definidos
[ ] Testes Multi-tenant e Negativos criados
[ ] Sem Mocks Operacionais
[ ] UTF-8 verificado
[ ] Lint, Typecheck, Build
[ ] Documentação atualizada