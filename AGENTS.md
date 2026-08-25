<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## ZapNFe security and maintainability rules

- Treat every browser, webhook, Meta, Gemini, Supabase and file value as untrusted input.
- Validate type, size, format, cardinality, tenant ownership and authorization server-side before processing.
- Normalize text, preserve React contextual escaping and never render external content with `dangerouslySetInnerHTML`.
- Never log or commit secrets, authorization codes, tokens, certificate contents or raw personal data.
- Keep Supabase RLS enabled and enforce tenant access in the database as well as the server.
- No JavaScript or TypeScript source file may exceed 1000 lines. Extract focused modules before the limit.
- `npm run quality` and `npm run security:audit` must pass before delivery.
- Keep Gitleaks, OpenGrep and OWASP ZAP workflows active; ZAP targets Preview, not production, unless explicitly approved.
- Privacy, retention, incident response and WhatsApp policy changes require documentation and legal review before production.
