# ZapNFe — Roadmap de produto e backlog estilo Jira

Versão do planejamento: 25 de agosto de 2026  
Projeto Jira sugerido: `ZNF`  
Objetivo do MVP: transformar mensagens de WhatsApp em pedidos revisados, emitir NF-e em homologação e entregar DANFE/XML ao cliente.

## 1. Visão do produto

Proposta inicial:

> Transforme os pedidos que chegam pelo WhatsApp em pedidos faturados, sem precisar redigitar tudo.

Fluxo principal:

`WhatsApp → identificação da empresa → extração do pedido → conferência humana → aprovação → NF-e → DANFE/XML → histórico`

O MVP não inclui estoque completo, compras, financeiro, CRM ou logística. A arquitetura deve permitir esses módulos depois da validação com os primeiros clientes.

## 2. Estado atual confirmado

### Concluído no código

- Next.js, React, TypeScript, Supabase, Gemini e Vercel estruturados.
- Interface inicial na paleta Lago Vulcânico.
- Deploy público e pipeline GitHub.
- Schema multiempresa inicial com organizações, membros, clientes, produtos, contas WhatsApp, mensagens, pedidos e itens.
- RLS e grants iniciais.
- Webhook `GET/POST` com validação de token, assinatura HMAC, limite de payload e schema Zod.
- Idempotência inicial pelo identificador de mensagem da Meta.
- Adaptador Gemini com saída estruturada e validação do resultado.
- RPC transacional para criação do pré-pedido.
- CSP com nonce, headers de segurança, Gitleaks, OpenGrep, npm audit e OWASP ZAP.
- Páginas iniciais de privacidade, termos e exclusão de dados.
- Regra de no máximo 1.000 linhas por arquivo em `src`.

### Implementado, mas ainda não validado de ponta a ponta

- Leitura e gravação no Supabase pela aplicação publicada.
- Extração real de pedido pelo Gemini.
- Recebimento de evento real da Meta.
- Separação real de dados entre dois usuários de empresas diferentes.

### Ainda não implementado

- Login, sessão, convite e troca de empresa.
- Dashboard com dados reais.
- CRUD de empresas, clientes e produtos.
- Lista e conferência de pedidos.
- Embedded Signup e envio de mensagens pela Meta.
- Integração Focus NFe.
- Certificado A1 e configuração fiscal.
- Envio de DANFE/XML.
- Observabilidade, fila durável, retentativas e operação do piloto.

## 3. Convenções Jira

### Tipos de issue

- `Epic`: capacidade grande de produto.
- `Story`: valor perceptível pelo usuário.
- `Task`: trabalho técnico ou operacional.
- `Spike`: pesquisa para remover incerteza.
- `Bug`: comportamento incorreto comprovado.

### Prioridades

- `P0`: bloqueia segurança, dados, faturamento ou release.
- `P1`: necessário para o MVP.
- `P2`: importante para piloto e escala inicial.
- `P3`: evolução posterior ao MVP.

### Status

`BACKLOG → READY → IN PROGRESS → CODE REVIEW → QA → BLOCKED → DONE`

Um item só entra em `BLOCKED` quando existe uma dependência externa concreta. Ausência de credencial não bloqueia layout, contratos, mocks, migrations ou testes.

### Story points

Escala Fibonacci: `1, 2, 3, 5, 8, 13`. Itens com mais de 13 pontos devem ser divididos antes de entrar em sprint.

## 4. Gates externos

| Gate | Dependência | Libera | Como fornecer com segurança |
|---|---|---|---|
| G0 | Nenhuma chave | UI, domínio, mocks, migrations, testes, documentação e CI | Já disponível |
| G1 | Supabase URL, publishable key e secret/service role | Auth, CRUD real, RLS e webhook persistido | Configurar diretamente em ambiente local/Vercel |
| G2 | Gemini API key | Extração real e avaliação de qualidade | Configurar como secret no servidor |
| G3 | Meta App, App Secret, verify token, token/WABA/phone ID | Webhook e envio real pelo WhatsApp | Configurar no painel/ambiente; nunca no chat ou Git |
| G4 | Focus NFe token de homologação | Emissão, consulta, webhook fiscal e documentos | Configurar apenas no servidor |
| G5 | Certificado A1 de empresa piloto e respectiva senha | Emissão fiscal da empresa | Upload autenticado; nunca enviar por chat ou Git |
| G6 | Razão social, CNPJ e contato de privacidade do controlador | Textos públicos e App Review | Dados empresariais, sem credenciais |

## 5. Releases e sprints

As datas começam quando o backlog da sprint estiver `READY`. Sprints têm duas semanas. As quatro primeiras semanas após G1–G4 formam o MVP de integração; o trabalho G0 pode começar imediatamente.

| Release | Sprints | Resultado verificável | Gates |
|---|---:|---|---|
| R0 — Fundação segura | concluída | UI, schema, webhook base, Gemini base, CI e segurança | G0 |
| R1 — Operação navegável | 1–2 | Login visual/mocks, produtos, clientes, pedidos e conferência navegáveis | G0; validação real usa G1 |
| R2 — WhatsApp para pré-pedido | 3–4 | Mensagem real cria pedido correto e isolado por empresa | G1, G2, G3 |
| R3 — Pedido para NF-e | 5–6 | Aprovação em homologação gera NF-e e registra DANFE/XML | G1, G4, G5 |
| R4 — Piloto assistido | 7–8 | 2 empresas operam com métricas, alertas e suporte | G1–G6 |
| R5 — MVP comercial | 9–10 | 5–10 empresas, onboarding repetível e critérios de produção atendidos | revisão Meta, fiscal, segurança e jurídica |
| R6 — Expansão validada | após receita | Próximo módulo escolhido por evidência dos pilotos | demanda comprovada |

### Sprint 1 — Pode começar sem chaves

- ZNF-201 a ZNF-205: shell de autenticação e autorização server-side.
- ZNF-401 a ZNF-406: produtos/clientes com repositório mockável.
- ZNF-501 a ZNF-506: lista, detalhe e conferência do pedido.
- ZNF-1201, ZNF-1202 e ZNF-1205: testes e fixtures.

### Sprint 2 — Pode começar sem chaves

- ZNF-301 a ZNF-306: onboarding da empresa.
- ZNF-601 a ZNF-606: pipeline de extração testável.
- ZNF-801 a ZNF-806: domínio fiscal e adaptador Focus simulado.
- ZNF-1005 e ZNF-1101 a ZNF-1104: auditoria e observabilidade.

### Caminho crítico após as chaves

`G1/Auth real → empresa piloto → catálogo real → G2/G3 mensagem real → conferência → G4/G5 emissão → entrega → piloto`

## 6. Backlog por épico

## ZNF-EP01 — Fundação, arquitetura e experiência de desenvolvimento

Objetivo: manter uma base modular, verificável e preparada para integrações substituíveis.

| Key | Tipo | Resumo | P | SP | Gate | Status |
|---|---|---|---:|---:|---|---|
| ZNF-101 | Story | Criar aplicação Next.js e identidade Lago Vulcânico | P1 | 5 | G0 | DONE |
| ZNF-102 | Task | Padronizar módulos de UI, domínio, integrações e infraestrutura | P1 | 5 | G0 | READY |
| ZNF-103 | Task | Manter `.env.example` validado e sem segredos | P0 | 2 | G0 | DONE |
| ZNF-104 | Task | CI de qualidade, build, Gitleaks, OpenGrep e audit | P0 | 5 | G0 | DONE |
| ZNF-105 | Task | OWASP ZAP e headers/CSP com nonce | P0 | 5 | G0 | DONE |
| ZNF-106 | Task | Criar padrão de erros, códigos públicos e correlation ID | P1 | 5 | G0 | BACKLOG |
| ZNF-107 | Task | Criar adaptadores de relógio, ID e transporte para testes determinísticos | P2 | 3 | G0 | BACKLOG |
| ZNF-108 | Task | Registrar ADRs para multi-tenancy, filas, A1 e provedor fiscal | P1 | 3 | G0 | BACKLOG |

Critérios de aceite do épico:

- Nenhuma regra de negócio importante depende diretamente de SDK externo.
- Integrações possuem interface, implementação real e fake de teste.
- `npm run quality` e gates de segurança permanecem obrigatórios.
- Nenhum arquivo de aplicação ultrapassa 1.000 linhas.

## ZNF-EP02 — Autenticação, sessões e multiempresa

Objetivo: cada usuário acessa apenas empresas das quais é membro, com permissões verificadas no servidor e no banco.

| Key | Tipo | Resumo | P | SP | Gate | Status |
|---|---|---|---:|---:|---|---|
| ZNF-201 | Story | Tela de login por e-mail e senha | P1 | 5 | G0/G1 | BACKLOG |
| ZNF-202 | Story | Recuperação e redefinição de senha | P1 | 3 | G1 | BACKLOG |
| ZNF-203 | Task | Sessão SSR segura e proteção de rotas | P0 | 8 | G1 | BACKLOG |
| ZNF-204 | Story | Convite de usuários para a empresa | P1 | 8 | G1 | BACKLOG |
| ZNF-205 | Story | Papéis `admin`, `manager` e `operator` aplicados server-side | P0 | 8 | G1 | PARTIAL |
| ZNF-206 | Story | Seletor de empresa para usuário com múltiplas associações | P2 | 5 | G1 | BACKLOG |
| ZNF-207 | Task | Testes pgTAP de isolamento RLS entre duas empresas | P0 | 8 | G1 | BACKLOG |
| ZNF-208 | Task | MFA obrigatório para administradores antes da produção | P2 | 5 | G1 | BACKLOG |
| ZNF-209 | Task | Encerramento de sessões e remoção de acesso | P1 | 3 | G1 | BACKLOG |

Critérios de aceite do épico:

- Usuário A não consegue ler, alterar ou inferir dados da empresa B por UI, API ou Data API.
- Ocultar botão nunca é tratado como autorização.
- Service role permanece exclusivamente no servidor.
- Convite expirado, removido ou pertencente a outra organização é recusado.

## ZNF-EP03 — Cadastro e onboarding da empresa

Objetivo: criar uma organização pronta para operar sem expor termos técnicos da Meta ao pequeno empresário.

| Key | Tipo | Resumo | P | SP | Gate | Status |
|---|---|---|---:|---:|---|---|
| ZNF-301 | Story | Wizard “Criar minha empresa” | P1 | 8 | G0/G1 | BACKLOG |
| ZNF-302 | Story | CNPJ, razão social, nome fantasia, endereço e contatos | P1 | 5 | G0/G1 | BACKLOG |
| ZNF-303 | Task | Validar e normalizar CNPJ, CEP, telefone e e-mail | P0 | 5 | G0 | BACKLOG |
| ZNF-304 | Story | Checklist de ativação da empresa | P1 | 5 | G0/G1 | BACKLOG |
| ZNF-305 | Story | Tela simples “Conectar WhatsApp” sem jargão WABA | P1 | 5 | G0 | BACKLOG |
| ZNF-306 | Story | Onboarding assistido para cliente sem familiaridade com Meta | P2 | 5 | G0 | BACKLOG |
| ZNF-307 | Spike | Confirmar elegibilidade e UX atual de Embedded Signup/Coexistence | P1 | 5 | G3 | BACKLOG |
| ZNF-308 | Task | Impedir avanço fiscal enquanto cadastro estiver incompleto | P0 | 3 | G1 | BACKLOG |

Critérios de aceite do épico:

- O cliente entende o próximo passo sem precisar conhecer API, WABA ou Business Manager.
- O backend é a única camada que trata código de autorização e tokens.
- O checklist diferencia “configurado”, “testado” e “pronto para produção”.

## ZNF-EP04 — Clientes, produtos, preços e importação

Objetivo: manter o catálogo mínimo necessário para interpretar e faturar pedidos.

| Key | Tipo | Resumo | P | SP | Gate | Status |
|---|---|---|---:|---:|---|---|
| ZNF-401 | Story | Listar, pesquisar e paginar produtos | P1 | 5 | G0/G1 | BACKLOG |
| ZNF-402 | Story | Criar e editar produto, SKU, unidade, aliases e preço | P1 | 8 | G0/G1 | BACKLOG |
| ZNF-403 | Story | Inativar e reativar produto com auditoria | P1 | 3 | G0/G1 | BACKLOG |
| ZNF-404 | Story | Importar produtos por CSV com prévia e relatório de erros | P1 | 8 | G0/G1 | BACKLOG |
| ZNF-405 | Story | Listar e editar clientes | P1 | 5 | G0/G1 | BACKLOG |
| ZNF-406 | Task | Resolver duplicidade de cliente por telefone/documento | P1 | 5 | G0/G1 | BACKLOG |
| ZNF-407 | Story | Adicionar NCM, CEST, CFOP, origem e tributação por produto | P1 | 8 | G0/G1/G4 | BACKLOG |
| ZNF-408 | Task | Validar catálogo antes de habilitar Gemini ou emissão | P0 | 5 | G0 | BACKLOG |
| ZNF-409 | Story | Exportar catálogo e clientes | P2 | 3 | G1 | BACKLOG |

Critérios de aceite do épico:

- SKU é único por empresa e alterações não afetam outra organização.
- Importação não grava parcialmente quando o modo atômico estiver selecionado.
- Alias melhora correspondência sem substituir o nome fiscal do produto.
- Estoque não entra no MVP; apenas um campo informativo futuro pode ser preparado.

## ZNF-EP05 — Caixa de entrada, pedidos e conferência

Objetivo: permitir que um operador transforme uma extração incerta em pedido correto antes de faturar.

| Key | Tipo | Resumo | P | SP | Gate | Status |
|---|---|---|---:|---:|---|---|
| ZNF-501 | Story | Dashboard com indicadores reais da empresa | P1 | 8 | G0/G1 | BACKLOG |
| ZNF-502 | Story | Lista de pedidos com busca, filtros, status e paginação | P1 | 8 | G0/G1 | BACKLOG |
| ZNF-503 | Story | Detalhe do pedido com mensagem original e extração | P1 | 5 | G0/G1 | BACKLOG |
| ZNF-504 | Story | Editar cliente, produto, unidade, quantidade e preço | P0 | 8 | G0/G1 | BACKLOG |
| ZNF-505 | Story | Calcular subtotal, desconto, frete e total no servidor | P0 | 5 | G0/G1 | BACKLOG |
| ZNF-506 | Story | Destacar itens ambíguos e impedir aprovação silenciosa | P0 | 5 | G0/G1 | BACKLOG |
| ZNF-507 | Story | Fluxo `Recebido → Conferência → Faturado → Finalizado` | P0 | 5 | G0/G1 | BACKLOG |
| ZNF-508 | Story | Criar pedido manual sem WhatsApp | P2 | 5 | G0/G1 | BACKLOG |
| ZNF-509 | Task | Controle otimista para evitar duas aprovações simultâneas | P0 | 5 | G1 | BACKLOG |
| ZNF-510 | Story | Histórico de alterações e responsável por cada decisão | P1 | 5 | G1 | BACKLOG |
| ZNF-511 | Story | Cancelar pedido com motivo, sem exclusão física | P1 | 3 | G1 | BACKLOG |

Critérios de aceite do épico:

- Totais exibidos e persistidos são calculados server-side.
- Pedido com item sem produto, quantidade inválida ou dado fiscal ausente não pode faturar.
- Toda transição inválida de status é rejeitada mesmo quando chamada fora da interface.
- O botão Aprovar é idempotente e deixa trilha de auditoria.

## ZNF-EP06 — Extração inteligente de pedidos

Objetivo: interpretar mensagens sem inventar produtos e medir continuamente a qualidade.

| Key | Tipo | Resumo | P | SP | Gate | Status |
|---|---|---|---:|---:|---|---|
| ZNF-601 | Task | Definir contrato versionado de extração | P0 | 3 | G0 | PARTIAL |
| ZNF-602 | Task | Criar fake do Gemini e fixtures de mensagens brasileiras | P1 | 5 | G0 | BACKLOG |
| ZNF-603 | Task | Testar prompt injection e conteúdo malicioso como dado não confiável | P0 | 5 | G0/G2 | BACKLOG |
| ZNF-604 | Story | Correspondência por SKU, nome, alias e contexto de unidade | P1 | 8 | G0/G2 | BACKLOG |
| ZNF-605 | Story | Limiar de confiança configurável por empresa | P2 | 3 | G1/G2 | BACKLOG |
| ZNF-606 | Task | Conjunto dourado de pedidos e métricas precision/recall | P1 | 8 | G0/G2 | BACKLOG |
| ZNF-607 | Story | Reprocessar mensagem falha sem duplicar pedido | P0 | 5 | G1/G2 | BACKLOG |
| ZNF-608 | Task | Limitar custo, catálogo e frequência de chamadas | P1 | 5 | G1/G2 | BACKLOG |
| ZNF-609 | Spike | Avaliar áudio somente depois de texto atingir meta de qualidade | P3 | 3 | G2/G3 | BACKLOG |

Critérios de aceite do épico:

- O modelo só pode retornar IDs existentes no catálogo; o servidor confirma novamente.
- Produto não identificado vira revisão humana, nunca item fiscal inventado.
- Mensagens de não-pedido não criam pedido.
- Meta inicial do piloto: pelo menos 90% dos itens reconhecidos corretamente no conjunto do nicho, sem aprovação automática.

## ZNF-EP07 — WhatsApp Cloud API e onboarding Meta

Objetivo: operar um único App Meta do ZapNFe para múltiplas empresas e números oficiais.

| Key | Tipo | Resumo | P | SP | Gate | Status |
|---|---|---|---:|---:|---|---|
| ZNF-701 | Task | Validar webhook GET com challenge | P0 | 3 | G3 | PARTIAL |
| ZNF-702 | Task | Validar POST por HMAC do corpo bruto | P0 | 5 | G3 | PARTIAL |
| ZNF-703 | Task | Persistir evento e responder rapidamente | P0 | 5 | G1/G3 | PARTIAL |
| ZNF-704 | Task | Substituir processamento apenas em `after()` por fila durável | P0 | 8 | G1 | BACKLOG |
| ZNF-705 | Task | Deduplicar eventos e impedir regressão de status | P0 | 8 | G1/G3 | BACKLOG |
| ZNF-706 | Story | Embedded Signup server-side por organização | P1 | 13 | G3 | BACKLOG |
| ZNF-707 | Task | Registrar WABA, phone number ID e número exibido | P1 | 5 | G1/G3 | BACKLOG |
| ZNF-708 | Task | Assinar o App na WABA e verificar assinatura | P1 | 5 | G3 | BACKLOG |
| ZNF-709 | Story | Exibir status da conexão e diagnóstico seguro | P1 | 5 | G1/G3 | BACKLOG |
| ZNF-710 | Story | Desconectar integração e revogar credenciais | P1 | 5 | G1/G3 | BACKLOG |
| ZNF-711 | Task | Implementar rate limit, replay protection e quarentena | P0 | 8 | G1/G3 | BACKLOG |
| ZNF-712 | Spike | Validar Coexistence para o público piloto | P1 | 5 | G3 | BACKLOG |
| ZNF-713 | Task | Preparar App Review, permissões e evidências | P1 | 8 | G3/G6 | BACKLOG |

Critérios de aceite do épico:

- `phone_number_id` resolve exatamente uma organização ativa.
- Evento duplicado ou fora de ordem não duplica pedido nem regride status.
- Token não aparece no navegador, logs, banco em texto aberto ou mensagens de erro.
- Falha transitória é retentada com backoff e encaminhada para dead-letter após o limite.
- Uso de WhatsApp Web não oficial permanece fora do produto comercial.

## ZNF-EP08 — Configuração fiscal, A1 e Focus NFe

Objetivo: emitir NF-e em homologação de forma idempotente, auditável e segura.

| Key | Tipo | Resumo | P | SP | Gate | Status |
|---|---|---|---:|---:|---|---|
| ZNF-801 | Spike | Mapear cadastro fiscal mínimo por regime/UF/nicho | P0 | 8 | G4 | BACKLOG |
| ZNF-802 | Task | Criar tabelas de configuração fiscal e documentos | P0 | 8 | G0 | BACKLOG |
| ZNF-803 | Story | Tela de configuração fiscal da empresa | P1 | 8 | G0/G1 | BACKLOG |
| ZNF-804 | Story | Upload A1 autenticado com validação de formato/tamanho | P0 | 8 | G0/G5 | BACKLOG |
| ZNF-805 | Task | ADR de custódia do A1: envio direto ao provedor ou criptografia temporária | P0 | 5 | G0/G4 | BACKLOG |
| ZNF-806 | Task | Adaptador Focus com transporte fake e contract tests | P0 | 8 | G0 | BACKLOG |
| ZNF-807 | Story | Validador de prontidão fiscal antes da aprovação | P0 | 8 | G0/G1/G4 | BACKLOG |
| ZNF-808 | Story | Emitir NF-e assíncrona usando referência idempotente | P0 | 13 | G4/G5 | BACKLOG |
| ZNF-809 | Task | Receber e autenticar webhook da Focus | P0 | 8 | G4 | BACKLOG |
| ZNF-810 | Story | Consultar situação e reconciliar nota pendente | P0 | 5 | G4 | BACKLOG |
| ZNF-811 | Story | Exibir autorização, rejeição e correção necessária | P1 | 5 | G1/G4 | BACKLOG |
| ZNF-812 | Task | Persistir chave, protocolo, XML, DANFE e payload sanitizado | P0 | 8 | G1/G4 | BACKLOG |
| ZNF-813 | Story | Cancelamento de NF-e dentro das regras aplicáveis | P2 | 8 | G4 | BACKLOG |
| ZNF-814 | Story | Carta de correção e inutilização | P3 | 8 | G4 | BACKLOG |

Critérios de aceite do épico:

- Toda primeira emissão ocorre em homologação.
- Duplo clique, timeout ou retentativa usa a mesma referência e não duplica NF-e.
- Pedido só vira `Faturado` após confirmação autorizada do provedor.
- Rejeição fiscal mantém o pedido corrigível e não é apresentada como sucesso.
- A1 e senha nunca são registrados em logs; retenção é mínima e documentada.

## ZNF-EP09 — Entrega de DANFE/XML e comunicação

Objetivo: devolver ao cliente o documento correto e registrar a entrega.

| Key | Tipo | Resumo | P | SP | Gate | Status |
|---|---|---|---:|---:|---|---|
| ZNF-901 | Story | Gerar links autenticados/expiráveis para DANFE e XML | P0 | 5 | G1/G4 | BACKLOG |
| ZNF-902 | Story | Enviar mensagem de NF-e autorizada pelo WhatsApp | P1 | 8 | G3/G4 | BACKLOG |
| ZNF-903 | Task | Respeitar janela de atendimento, opt-in e templates | P0 | 8 | G3 | BACKLOG |
| ZNF-904 | Task | Persistir wamid e estados enviado/entregue/lido/falho | P1 | 8 | G1/G3 | BACKLOG |
| ZNF-905 | Story | Reenviar documento sem reemitir a nota | P1 | 3 | G1/G3/G4 | BACKLOG |
| ZNF-906 | Story | Download seguro pelo painel | P1 | 3 | G1/G4 | BACKLOG |
| ZNF-907 | Task | Retentativa e alerta para falha de entrega | P1 | 5 | G1/G3 | BACKLOG |

Critérios de aceite do épico:

- O link não revela caminho interno nem permite trocar organização/documento.
- Reenvio não cria nova NF-e.
- Status de entrega é idempotente e tolera eventos fora de ordem.
- Mensagens comerciais seguem consentimento e regras vigentes da plataforma.

## ZNF-EP10 — Segurança, privacidade, LGPD e governança

Objetivo: incorporar segurança e privacidade ao ciclo de desenvolvimento e à operação.

| Key | Tipo | Resumo | P | SP | Gate | Status |
|---|---|---|---:|---:|---|---|
| ZNF-1001 | Task | Validação, normalização e limites de entrada | P0 | 5 | G0 | DONE |
| ZNF-1002 | Task | CSP, HSTS, isolamento de origem e anti-clickjacking | P0 | 5 | G0 | DONE |
| ZNF-1003 | Task | SAST, secrets scan, dependências e DAST | P0 | 8 | G0 | DONE |
| ZNF-1004 | Task | Threat model por fluxo e fronteira de confiança | P0 | 8 | G0 | BACKLOG |
| ZNF-1005 | Task | Log de auditoria append-only para ações críticas | P0 | 8 | G0/G1 | BACKLOG |
| ZNF-1006 | Task | Inventário de dados, finalidade, base legal e operadores | P0 | 8 | G6 | BACKLOG |
| ZNF-1007 | Story | Central de privacidade e solicitações do titular | P1 | 8 | G1/G6 | BACKLOG |
| ZNF-1008 | Task | Política e job de retenção/exclusão/anomização | P0 | 8 | G1/G6 | BACKLOG |
| ZNF-1009 | Task | Plano de resposta a incidente e comunicação | P0 | 5 | G6 | BACKLOG |
| ZNF-1010 | Task | Rotação de secrets e matriz de acesso operacional | P0 | 5 | G1–G4 | BACKLOG |
| ZNF-1011 | Task | Backup, restauração testada e RPO/RTO | P0 | 8 | G1 | BACKLOG |
| ZNF-1012 | Task | Revisão jurídica de privacidade, termos e contratos | P0 | 5 | G6 | BACKLOG |
| ZNF-1013 | Task | RIPD quando avaliação de risco indicar necessidade | P1 | 5 | G6 | BACKLOG |

Critérios de aceite do épico:

- Nenhum segredo entra no Git, chat, bundle do navegador ou log.
- Todas as tabelas expostas têm RLS, grants mínimos e testes positivos/negativos.
- Solicitações de acesso, correção e exclusão têm protocolo e identidade verificada.
- Incidentes têm responsável, classificação, evidências, contenção e prazo operacional definido.
- Textos legais são revisados antes da produção e não prometem controles inexistentes.

## ZNF-EP11 — Observabilidade, filas e suporte operacional

Objetivo: detectar falhas antes que o cliente descubra e conseguir recuperar o fluxo.

| Key | Tipo | Resumo | P | SP | Gate | Status |
|---|---|---|---:|---:|---|---|
| ZNF-1101 | Task | Logging estruturado sem conteúdo sensível | P0 | 5 | G0 | BACKLOG |
| ZNF-1102 | Task | Correlation ID da mensagem até a NF-e | P1 | 5 | G0/G1 | BACKLOG |
| ZNF-1103 | Task | Métricas de webhook, Gemini, fila, pedidos e Focus | P1 | 8 | G1–G4 | BACKLOG |
| ZNF-1104 | Task | Health checks por dependência sem expor configuração | P1 | 5 | G0 | BACKLOG |
| ZNF-1105 | Task | Alertas para fila parada, falhas repetidas e webhook inativo | P0 | 8 | G1–G4 | BACKLOG |
| ZNF-1106 | Story | Painel técnico de reprocessamento e dead-letter | P1 | 8 | G1 | BACKLOG |
| ZNF-1107 | Task | Runbooks de incidentes e indisponibilidade de provedor | P1 | 5 | G0 | BACKLOG |
| ZNF-1108 | Task | SLO inicial e orçamento de erro | P2 | 3 | G1–G4 | BACKLOG |

Critérios de aceite do épico:

- É possível localizar um pedido usando IDs internos sem pesquisar conteúdo de mensagem em logs.
- Reprocessamento é autorizado, auditado e idempotente.
- Falha da Meta, Gemini, Supabase ou Focus é distinguível.

## ZNF-EP12 — Qualidade, testes e release

Objetivo: impedir regressões e comprovar o caminho crítico antes de cada release.

| Key | Tipo | Resumo | P | SP | Gate | Status |
|---|---|---|---:|---:|---|---|
| ZNF-1201 | Task | Unit tests para domínio, schemas, totais e estados | P0 | 8 | G0 | BACKLOG |
| ZNF-1202 | Task | Fixtures de webhooks Meta e Focus sem dados reais | P0 | 5 | G0 | BACKLOG |
| ZNF-1203 | Task | Contract tests dos adaptadores Gemini/Meta/Focus | P0 | 8 | G0 | BACKLOG |
| ZNF-1204 | Task | Testes de integração com Supabase local/branch | P0 | 8 | G1 | BACKLOG |
| ZNF-1205 | Task | E2E do login até conferência com mocks | P1 | 8 | G0 | BACKLOG |
| ZNF-1206 | Task | E2E homologação WhatsApp → NF-e → documento | P0 | 13 | G1–G5 | BACKLOG |
| ZNF-1207 | Task | Testes de concorrência, duplicidade e retentativa | P0 | 8 | G1 | BACKLOG |
| ZNF-1208 | Task | Acessibilidade teclado/leitor e responsividade | P1 | 5 | G0 | BACKLOG |
| ZNF-1209 | Task | Performance com catálogo e pedidos representativos | P2 | 5 | G1 | BACKLOG |
| ZNF-1210 | Task | Checklist de release e rollback | P0 | 5 | G0 | BACKLOG |

Critérios de aceite do épico:

- O caminho crítico tem teste automático e roteiro manual.
- Build/Preview isolado não é aceito como prova de banco, RLS ou integração externa.
- Toda migration tem teste, plano de rollback ou estratégia forward-only documentada.
- Produção exige aprovação explícita após homologação.

## ZNF-EP13 — Piloto, métricas e operação comercial

Objetivo: validar economia real de tempo e escolher a evolução pelo comportamento dos clientes.

| Key | Tipo | Resumo | P | SP | Gate | Status |
|---|---|---|---:|---:|---|---|
| ZNF-1301 | Task | Definir nicho e perfil de cliente ideal | P1 | 3 | G0 | BACKLOG |
| ZNF-1302 | Task | Recrutar 2 clientes design partners | P1 | 5 | G6 | BACKLOG |
| ZNF-1303 | Task | Medir baseline: pedidos/dia, tempo, erros e pessoas | P1 | 5 | G6 | BACKLOG |
| ZNF-1304 | Story | Dashboard de tempo economizado com cálculo transparente | P2 | 5 | G1 | BACKLOG |
| ZNF-1305 | Task | Roteiro de onboarding assistido e treinamento | P1 | 5 | G0 | BACKLOG |
| ZNF-1306 | Task | Canal de feedback, bugs e pedidos de função | P1 | 3 | G0 | BACKLOG |
| ZNF-1307 | Task | Critérios go/no-go para ampliar de 2 para 5–10 empresas | P0 | 5 | G0 | BACKLOG |
| ZNF-1308 | Task | Definir preço piloto e termo comercial | P2 | 5 | G6 | BACKLOG |

Critérios de aceite do épico:

- Métrica principal: minutos humanos por pedido faturado.
- Métricas auxiliares: taxa de itens corrigidos, tempo até conferência, erros fiscais e disponibilidade.
- Nenhum novo módulo grande entra apenas por opinião isolada.
- A expansão ocorre quando o caminho principal é repetível e seguro.

## ZNF-EP14 — Expansão pós-MVP

Objetivo: evoluir para ERP vertical somente após evidência comercial.

| Key | Tipo | Resumo | P | SP | Gate | Status |
|---|---|---|---:|---:|---|---|
| ZNF-1401 | Epic futuro | Estoque e disponibilidade | P3 | — | validação piloto | ICEBOX |
| ZNF-1402 | Epic futuro | Compras e fornecedores | P3 | — | estoque validado | ICEBOX |
| ZNF-1403 | Epic futuro | Contas a receber/pagar e conciliação | P3 | — | demanda validada | ICEBOX |
| ZNF-1404 | Epic futuro | Entregas, rotas e comprovantes | P3 | — | demanda validada | ICEBOX |
| ZNF-1405 | Epic futuro | Vendedores, metas e comissões | P3 | — | demanda validada | ICEBOX |
| ZNF-1406 | Epic futuro | Relatórios e inteligência por segmento | P3 | — | dados suficientes | ICEBOX |
| ZNF-1407 | Epic futuro | ERP especializado por nicho | P3 | — | receita e padrão comprovados | ICEBOX |

Regra de entrada no roadmap:

- Demanda recorrente em múltiplos clientes.
- Benefício mensurável e disposição de pagamento.
- Impacto no caminho `WhatsApp → Pedido → NF-e` compreendido.
- Capacidade operacional e de suporte disponível.

## 7. Definition of Ready

Uma história está `READY` quando:

- problema, usuário e resultado esperado estão claros;
- critérios de aceite são testáveis;
- dependências e gates estão identificados;
- design ou contrato necessário está disponível;
- não possui mais de 13 pontos;
- riscos de segurança, privacidade e multi-tenancy foram considerados.

## 8. Definition of Done

Uma história está `DONE` quando:

- critérios de aceite foram atendidos;
- autorização server-side e RLS foram verificadas quando aplicável;
- testes relevantes passaram;
- `npm run quality` passou;
- audit, Gitleaks, OpenGrep e ZAP aplicáveis passaram;
- entradas possuem validação, limites e tratamento de erro seguro;
- logs não contêm segredo ou dado pessoal desnecessário;
- documentação e migration foram atualizadas;
- fluxo relacionado foi testado, não apenas a tela alterada;
- homologação externa foi comprovada quando a issue depende de chave;
- release/rollback foram avaliados.

## 9. Critérios de saída do MVP

O MVP está pronto para piloto quando:

1. Dois usuários de organizações diferentes passam nos testes de isolamento.
2. Produto e cliente podem ser cadastrados/importados pelo painel.
3. Mensagem real assinada cria exatamente um pré-pedido.
4. Operador corrige ambiguidades e aprova o pedido.
5. Totais são recalculados no servidor.
6. NF-e de homologação é emitida uma única vez.
7. Autorização/rejeição fiscal é reconciliada.
8. DANFE/XML corretos ficam disponíveis e podem ser enviados.
9. Auditoria identifica quem aprovou e o que foi alterado.
10. Retentativas não duplicam mensagem, pedido ou nota.
11. Backups, alertas e runbooks mínimos foram testados.
12. Privacidade, termos, exclusão e dados do controlador foram revisados.

O MVP está pronto para produção somente depois de homologação fiscal, aprovação operacional, revisão de políticas da Meta, segurança e revisão jurídica.

## 10. Riscos principais

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Produto incorreto extraído pela IA | média | alto | catálogo fechado, confiança, revisão humana e conjunto dourado |
| Duplicidade por webhook/retry | alta | alto | chaves idempotentes, fila e transações |
| Vazamento entre empresas | baixa/média | crítico | RLS, grants mínimos, testes com dois tenants e server auth |
| Emissão fiscal duplicada | média | crítico | referência única, lock, máquina de estados e reconciliação |
| Custódia insegura do A1 | média | crítico | envio direto ao provedor ou criptografia temporária e auditoria |
| Onboarding Meta complexo | alta | alto | Embedded Signup simples, assistência e pesquisa de Coexistence |
| Mudança de política/API externa | média | alto | adaptadores, contract tests e revisão periódica |
| Dependência de `after()` sem retentativa durável | alta | alto | fila persistente e dead-letter antes do piloto |
| Texto legal incompatível com a operação | média | alto | inventário real de dados e revisão jurídica |
| Construção prematura de ERP | alta | médio | gates de evidência e backlog ICEBOX |

## 11. Referências técnicas para refinamento

- [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase — Auth](https://supabase.com/docs/guides/auth)
- [Focus NFe — Emitir NF-e](https://doc.focusnfe.com.br/reference/emitir_nfe)
- [Focus NFe — Webhooks](https://doc.focusnfe.com.br/reference/webhooks)
- [Next.js — Content Security Policy](https://nextjs.org/docs/app/guides/content-security-policy)
- [OWASP ZAP — Baseline Scan](https://www.zaproxy.org/docs/docker/baseline-scan/)
- [ANPD — Direitos dos titulares](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares)
- [LGPD — Lei nº 13.709/2018](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm)

As permissões, políticas e etapas de App Review da Meta devem ser reconfirmadas na documentação oficial no momento da implementação, pois mudam ao longo do tempo.
