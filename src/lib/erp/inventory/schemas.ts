import { z } from "zod";
import { normalizeUntrustedText } from "@/lib/security/input";

export const stockAdjustmentSchema = z.object({
  warehouseId: z.uuid(),
  productId: z.uuid(),
  adjustmentType: z.enum(["opening_balance", "adjustment_in", "adjustment_out"]),
  quantity: z.coerce.number().positive().max(999_999_999),
  unitCost: z.union([z.literal(""), z.coerce.number().min(0).max(999_999_999_999)]).transform((value) => value === "" ? null : value),
  notes: z.string().transform((value) => normalizeUntrustedText(value, 1000)),
});

export const reverseMovementSchema = z.object({
  movementId: z.uuid(),
  reason: z.string().transform((value) => normalizeUntrustedText(value, 500)).pipe(z.string().min(5, "Explique o motivo da reversão.")),
});

export const warehouseInputSchema = z.object({
  id: z.uuid().optional(),
  branchId: z.string().transform((value) => value || null).pipe(z.uuid().nullable()),
  code: z.string().transform((value) => normalizeUntrustedText(value, 30)).pipe(z.string().min(1)),
  name: z.string().transform((value) => normalizeUntrustedText(value, 120)).pipe(z.string().min(2)),
  active: z.boolean(),
});
