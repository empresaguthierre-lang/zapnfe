# Fase 1 — WhatsApp, Gemini e Supabase

## Fluxo implementado

1. A Meta envia um evento para `GET/POST /api/webhooks/whatsapp`.
2. O `GET` confirma o token de verificação configurado na Meta.
3. O `POST` lê o corpo bruto e valida `X-Hub-Signature-256` com o App Secret.
4. A aplicação responde imediatamente e processa a mensagem em segundo plano.
5. O `phone_number_id` identifica a empresa em `whatsapp_accounts`.
6. O `wamid` é persistido com restrição única, evitando pedidos duplicados.
7. O catálogo ativo da empresa é enviado ao Gemini para extração estruturada.
8. Uma função transacional cria/atualiza o cliente, o pedido e seus itens.
9. O pedido nasce em `review` e itens ambíguos ficam com `needs_review = true`.

## Configuração necessária

Preencha as variáveis diretamente em `.env.local` e posteriormente na Vercel. Nunca coloque chaves no Git ou na conversa.

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SECRET_KEY` ou `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_APP_SECRET`

O token de envio e o `phone_number_id` serão usados quando implementarmos respostas automáticas. Nesta entrega, o webhook recebe e processa mensagens de texto.

## Bootstrap da primeira empresa

Antes do primeiro teste, é necessário:

1. Criar um registro em `organizations`.
2. Criar um registro em `whatsapp_accounts` com o `phone_number_id` da Meta.
3. Criar produtos com SKU, nome, aliases, unidade e preço.
4. Quando houver login, associar o usuário em `organization_members`.

Esses registros devem ser criados pelo painel administrativo ou por um script server-side com a chave secreta. Não exponha a chave secreta no navegador.

## Webhook da Meta

- Callback: `https://SEU-DOMINIO/api/webhooks/whatsapp`
- Verify token: o mesmo valor de `WHATSAPP_VERIFY_TOKEN`
- Campo necessário: `messages`

Comece com um número e aplicação de teste. Ative produção somente depois de validar assinatura, idempotência, correspondência de produtos e RLS.

## Limites atuais

- Apenas mensagens de texto são interpretadas.
- Áudio, imagem e documento ficam registrados como ignorados.
- O sistema ainda não responde pelo WhatsApp.
- O painel ainda usa dados demonstrativos.
- A empresa, conta WhatsApp e catálogo ainda precisam ser cadastrados.
