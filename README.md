# Bridge ERP

Sistema de Gestão Empresarial integrado e modular com inteligência para automação de processos.

## Módulos

1. Comercial & Pedidos (Vendas, Clientes, Canais)
2. Estoque & Kardex (Produtos, Movimentações, Reservas)
3. Financeiro (Contas a Receber, Contas a Pagar, Conciliação)
4. Fiscal (Emissão e Recepção de Documentos Fiscais)

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

## Fase 1

O webhook seguro, a extração estruturada pelo Gemini e o schema multiempresa do Supabase estão descritos em [docs/FASE_1_WHATSAPP_GEMINI.md](docs/FASE_1_WHATSAPP_GEMINI.md).

O planejamento completo em formato de backlog Jira está em [docs/ROADMAP_JIRA.md](docs/ROADMAP_JIRA.md).
