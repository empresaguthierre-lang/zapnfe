# ZapNFe

Transforme pedidos recebidos pelo WhatsApp em pedidos faturados, sem redigitação.

## MVP

1. WhatsApp + Gemini: receber mensagens, extrair itens e gravar pedidos no Supabase.
2. Focus NFe: revisar e aprovar o pedido, emitir a NF-e e enviar o DANFE ao cliente.
3. Produtos + certificado A1: painel de produtos, preços e configuração fiscal da empresa.

## Stack

- Next.js App Router, React e TypeScript
- Tailwind CSS
- Supabase
- Gemini
- WhatsApp Cloud API
- Focus NFe
- Vercel

## Desenvolvimento local

Instale as dependências:

```bash
npm install
```

Copie `.env.example` para `.env.local` e preencha as chaves localmente. Nunca envie `.env.local` ou credenciais ao Git.

Inicie o projeto:

```bash
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000).

## Ambientes

As integrações fiscal e de WhatsApp devem começar em homologação/teste. A publicação em produção exige validação específica das credenciais, banco de dados e fluxo completo.
