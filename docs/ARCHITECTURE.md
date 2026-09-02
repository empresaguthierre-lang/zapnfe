# ERP Architecture

Esta é a definição arquitetural do sistema. Toda nova feature deve obedecer a estas regras.

## 1. Domínios Independentes

O sistema é dividido em domínios estritos:
- **COMERCIAL** (Pedidos, Clientes)
- **ESTOQUE** (Produtos, Depósitos, Movimentações, Reservas)
- **FINANCEIRO** (Contas a Receber, Contas a Pagar, Pagamentos)
- **FISCAL** (Documentos Fiscais, Restrições Fiscais)
- **BANCO** (Transações Bancárias, Conciliação)
- **LOGÍSTICA** (Entregas, Rastreio)

**Regra:** Uma ação pode gerar consequências em outros domínios, mas não significa que são a mesma entidade.
*Exemplo:* NF autorizada NÃO significa automaticamente mercadoria entregue. Pedido aprovado NÃO significa cliente pagou.
Essa separação não pode ser quebrada por atalhos futuros.

## 2. Dependências de Módulos (Apontar para dentro)

Cada módulo expõe interfaces públicas controladas.
- `Fiscal` pode consumir `Orders`.
- `Orders` não deve importar página/componentes de `Fiscal`.

Preferência de diretórios:
- `src/lib/erp/catalog/`
- `src/lib/erp/inventory/`
- `src/lib/erp/finance/`
- `src/lib/erp/fiscal/`
- `src/lib/erp/banking/`

**Proibido:** Fazer com que `page.tsx` contenha domínio ou regras de negócio críticas.

## 3. Estado Atual x História

O estado atual (para leitura rápida) e a história são coisas diferentes.
- Estado atual: `orders.financial_status = paid`, `invoices.status = authorized`
- História: `receivable_payments`, `invoice_events`

**Regra:** Nunca substituir a história pelo status atual. Fatos históricos ficam em tabelas _append-only_.

## 4. Documentos Históricos usam Snapshot

Toda informação documental que não pode mudar retroativamente deve ser copiada.
- **NF:** Copia `recipient_name_snapshot`, `recipient_document_snapshot`, etc.
- **Produto em NF:** Copia `sku_snapshot`, `description_snapshot`, `ncm_snapshot`, etc.

Alterar o cadastro amanhã nunca altera um documento histórico de ontem.

## 5. IA nunca é regra obrigatória do ERP

A IA pode interpretar, sugerir, explicar e classificar (quando permitido).
Mas se o módulo de IA cair, o ERP completo tem que continuar funcional.
A operação crítica SEMPRE passa pelo domínio determinístico.

## 6. Integrações sempre através de Adapter

Proibido espalhar código de provedor externo (ex: `focusNfe.issue()`) pela lógica de negócio.
Deve existir um `FiscalProvider` genérico que implementa o adapter (`FocusNFeProvider`, `NuvemFiscalProvider`, etc.).
Isso vale para Bancos, Mensageria, Email e Logística.

## 7. Business Events

Todo evento de negócio deve ter um contrato estável contendo no mínimo:
- `event_type` (ex: `finance.payment_received`)
- `schema_version` (ex: `1`)
- `organization_id`
- `actor_id`
- `entity_type`
- `entity_id`
- `occurred_at`
- `payload`

Business Event reflete o que aconteceu no negócio. É diferente do Audit Log (Quem fez o quê).