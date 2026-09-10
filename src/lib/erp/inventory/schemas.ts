import { z } from "zod";
import { hasPotentiallyMaliciousContent, normalizeUntrustedText } from "@/lib/security/input";

const text = (max: number) => z.string()
  .transform((value) => normalizeUntrustedText(value, max))
  .refine((value) => !hasPotentiallyMaliciousContent(value), "Conteúdo não permitido.");

export const stockAdjustmentSchema = z.object({
  warehouseId: z.uuid(),
  productId: z.uuid(),
  adjustmentType: z.enum(["opening_balance", "adjustment_in", "adjustment_out"]),
  quantity: z.coerce.number().positive().max(999_999_999),
  unitCost: z.union([z.literal(""), z.coerce.number().min(0).max(999_999_999_999)]).transform((value) => value === "" ? null : value),
  notes: text(1000),
});

export const reverseMovementSchema = z.object({
  movementId: z.uuid(),
  reason: text(500).pipe(z.string().min(5, "Explique o motivo da reversão.")),
});

export const warehouseInputSchema = z.object({
  id: z.uuid().optional(),
  branchId: z.string().transform((value) => value || null).pipe(z.uuid().nullable()),
  code: text(30).pipe(z.string().min(1)),
  name: text(120).pipe(z.string().min(2)),
  active: z.boolean(),
});
