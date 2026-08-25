# Segurança do ZapNFe

Não publique vulnerabilidades, tokens, dados pessoais ou evidências sensíveis em issues públicas.

Antes da produção, este documento deverá informar um endereço privado de segurança e uma chave pública para comunicação responsável. Enquanto o canal não estiver definido, o sistema deve permanecer em homologação.

## Controles obrigatórios

- Toda entrada externa passa por schema, limite, normalização e autorização server-side.
- Nenhuma chave secreta pode usar prefixo `NEXT_PUBLIC_`.
- Conteúdo de WhatsApp nunca pode ser renderizado com `dangerouslySetInnerHTML`.
- RLS deve permanecer ativa em toda tabela exposta do Supabase.
- Gitleaks, OpenGrep, auditoria npm, lint, build e limite de linhas devem passar antes do merge.
- OWASP ZAP deve ser executado contra Preview antes de uma liberação relevante.
- Incidentes e acessos administrativos devem gerar registro auditável sem armazenar segredo em logs.

## Resposta a incidentes

Preservar evidências, conter o acesso, avaliar dados e titulares afetados, registrar decisões, corrigir a causa e acionar o responsável de privacidade. Quando aplicável, o controlador deve observar o procedimento e os prazos definidos pela ANPD.
