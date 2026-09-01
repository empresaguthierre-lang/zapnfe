import { z } from "zod";
import { normalizeUntrustedText } from "@/lib/security/input";

export const PAGE_SIZE = 50;

const listQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
  status: z.string().optional(),
  warehouse: z.string().optional(),
  product: z.string().optional(),
  type: z.string().optional(),
});

export type ListQuery = z.infer<typeof listQuerySchema>;

export function parseListQuery(input: Record<string, string | string[] | undefined>): ListQuery {
  const parsed = listQuerySchema.parse({
    q: typeof input.q === "string" ? normalizeUntrustedText(input.q, 80) : undefined,
    page: typeof input.page === "string" ? input.page : 1,
    status: typeof input.status === "string" ? normalizeUntrustedText(input.status, 40) : undefined,
    warehouse: typeof input.warehouse === "string" ? normalizeUntrustedText(input.warehouse, 40) : undefined,
    product: typeof input.product === "string" ? normalizeUntrustedText(input.product, 40) : undefined,
    type: typeof input.type === "string" ? normalizeUntrustedText(input.type, 40) : undefined,
  });
  return parsed;
}

export function pageRange(page: number) {
  const from = (page - 1) * PAGE_SIZE;
  return { from, to: from + PAGE_SIZE - 1 };
}

export function escapePostgrestSearch(value: string) {
  return value.replace(/[,%()]/g, " ").replace(/\s+/g, " ").trim();
}
