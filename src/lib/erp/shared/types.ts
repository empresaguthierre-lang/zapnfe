export type PageResult<T> = { rows: T[]; count: number; page: number; pageSize: number };

export type ActionResult =
  | { ok: true; message: string; id?: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string[]> };

export type SelectOption = { value: string; label: string };

export function databaseErrorMessage(context: string) {
  return `Não foi possível ${context}. Tente novamente ou contate o administrador.`;
}
