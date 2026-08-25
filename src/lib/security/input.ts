const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

export function normalizeUntrustedText(value: string, maxLength: number) {
  return value.normalize("NFKC").replace(CONTROL_CHARACTERS, "").trim().slice(0, maxLength);
}

export function normalizePhone(value: string) {
  return value.replace(/\D/g, "").slice(0, 15);
}

export function publicErrorMessage(error: unknown) {
  return error instanceof Error ? normalizeUntrustedText(error.message, 300) : "Erro interno não identificado";
}
