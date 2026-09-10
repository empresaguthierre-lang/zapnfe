const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const ACTIVE_CONTENT_PATTERNS = [
  /<\s*\/?\s*(?:script|iframe|object|embed|svg|math|style|link|meta|base|form)\b/i,
  /\bon[a-z]{3,}\s*=/i,
  /\b(?:javascript|vbscript)\s*:/i,
  /\bdata\s*:\s*text\/html/i,
];

export function normalizeUntrustedText(value: string, maxLength: number) {
  return value.normalize("NFKC").replace(CONTROL_CHARACTERS, "").trim().slice(0, maxLength);
}

export function normalizePhone(value: string) {
  return value.replace(/\D/g, "").slice(0, 15);
}

export function hasPotentiallyMaliciousContent(value: string) {
  const normalized = value.normalize("NFKC");
  return ACTIVE_CONTENT_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function publicErrorMessage(error: unknown) {
  return error instanceof Error ? normalizeUntrustedText(error.message, 300) : "Erro interno não identificado";
}
