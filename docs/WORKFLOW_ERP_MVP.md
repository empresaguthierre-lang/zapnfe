# Workflow do ERP MVP

## DONE
- [x] Aplicadas migrations base do ERP (organization_modules, warehouses, etc).
- [x] Security Hardening: REVOKE EXECUTE em inventory_post_movement do authenticated.
- [x] Criacao da RPC publica inventory_adjust_stock.
- [x] Estrutura base de rotas /erp incorporada ao shell existente.
- [x] Paginas de Produtos (listagem, novo, editar, abas de estoque e historico).
- [x] Formulario de Entrada/Ajuste de Estoque via Server Actions (Zod + Supabase).
- [x] Visao Geral de Estoque consumindo inventory_overview.
- [x] Livro de Movimentacoes (listagem, paginacao e botao de estorno compensatorio).
- [x] Gestao de Depositos, Clientes e Fornecedores.
- [x] Validacoes rigorosas (lint, typecheck, build) passando 100%.

## TODO
- [ ] Modulo de Compras (entradas por fornecedor).
- [ ] Integracao Estoque x Pedidos (Reserva automatica ao aprovar, baixa ao faturar).
- [ ] Emissao Fiscal (Focus NFe) e Financeiro completo (Contas a Pagar/Receber).

## Migrations Novas
- 20260901110000_harden_inventory_adjustments.sql: Cria o proxy seguro inventory_adjust_stock e restringe o motor principal apenas ao service_role.

## Rotas Criadas
- /erp (Dashboard simplificado)
- /erp/produtos, /erp/produtos/novo, /erp/produtos/[id]
- /erp/estoque, /erp/estoque/movimentacoes, /erp/estoque/depositos
- /erp/clientes, /erp/fornecedores
- /erp/configuracoes/empresa, /erp/configuracoes/filiais, /erp/configuracoes/modulos
- /erp/financeiro, /erp/fiscal (Views "Em breve")

## RPCs Utilizadas
- inventory_adjust_stock (nova, exposta para admin/manager)
- inventory_post_movement (interna)
- inventory_reverse_movement (estorno com motivo)
- erp_initialize_organization (bootstrap)

## Decisoes Arquiteturais
- Seguranca e Multitenancy: A organizacao ativa governa as consultas via organization_id, apoiado por RLS.
- Performance: Zero ocorrencias de SELECT *. Paginacao nativa, debounce e Views (inventory_overview).
- Camada Limpa: Isolamento do Supabase nas mutations em src/lib/erp/.
- Compatibilidade: Fluxo legado de Webhooks/Orders intacto.

## Bugs Conhecidos
- Nenhum bug de gravidade Alta identificado.
