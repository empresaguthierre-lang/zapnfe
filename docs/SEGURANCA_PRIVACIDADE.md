# Baseline de segurança e privacidade

## Entrada e saída

- Validar tipo, tamanho, formato, cardinalidade e autorização antes do processamento.
- Normalizar texto Unicode e remover caracteres de controle; nunca tentar “limpar HTML” para depois executá-lo.
- React deve continuar escapando texto por padrão. É proibido usar `dangerouslySetInnerHTML` com dados externos.
- Mensagens são conteúdo não confiável inclusive dentro do prompt do Gemini; somente saída aderente ao schema pode avançar.
- SQL deve usar Supabase/PostgREST ou parâmetros, nunca concatenação de entrada.

## Autorização

- Autorização deve ocorrer no servidor e no banco por RLS.
- A interface pode ocultar ações, mas isso não substitui autorização.
- Chaves secretas e tokens Meta ficam somente no servidor, com rotação, criptografia e acesso mínimo.

## Privacidade e LGPD

- Definir para cada tratamento: finalidade, categoria de dados, base legal, controlador, operador, destinatários e retenção.
- Coletar somente o necessário para pedido, suporte, segurança e obrigação fiscal.
- Disponibilizar canal verificável para direitos do titular e protocolo de atendimento.
- Criar política de retenção para mensagens, logs, pedidos, documentos fiscais e backups.
- Registrar incidentes, avaliação de risco, mitigação e justificativa de comunicação ou não comunicação.
- Realizar revisão jurídica antes da produção; este repositório não constitui parecer jurídico.

## WhatsApp

- Usar somente Cloud API e fluxos oficiais da Meta.
- Respeitar opt-in, qualidade, templates, janela de atendimento e proibição de spam.
- Publicar URLs reais de privacidade, termos e exclusão antes do App Review.
- Não registrar App Secret, access token, código de autorização ou conteúdo integral de mensagens em logs.

## Gates

- `npm run quality`
- `npm run security:audit`
- Gitleaks em push e pull request.
- OpenGrep com regras de auditoria e OWASP Top 10.
- ZAP Baseline manual contra URL Vercel Preview autorizada.

### Exceções documentadas do ZAP

As regras abaixo são ignoradas somente no baseline público e não autorizam o mesmo comportamento em APIs ou páginas autenticadas:

- `10015`, `10049` e `10050`: cache esperado para HTML público e arquivos estáticos imutáveis. Respostas autenticadas ou com dados pessoais devem usar cache privado ou `no-store`.
- `10098`: a CDN pode permitir leitura cross-origin de conteúdo público e arquivos estáticos sem credenciais. APIs continuam sem CORS aberto por padrão.
- `10109`: identificação informativa de aplicação web moderna, sem vulnerabilidade associada.
- `10031`: o ZAP marcou os campos internos `$ACTION_*` gerados pelo Next.js. Eles não são renderizados como HTML da aplicação; React continua escapando saídas e toda entrada útil da action é validada por schema no servidor.
- `10111`: identifica corretamente a requisição de autenticação e é somente informativa.
- `10202`: Server Actions não usam token CSRF em campo oculto. O framework aceita apenas `POST` e rejeita a action quando `Origin` não corresponde a `Host`/`X-Forwarded-Host`; cookies de sessão continuam com as proteções do Supabase.

Wildcards de CSP e ausência de isolamento de origem não são exceções: devem falhar no baseline.
