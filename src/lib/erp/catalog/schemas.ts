import { z } from "zod";
import { normalizeUntrustedText } from "@/lib/security/input";

const text = (max: number) => z.string().transform((value) => normalizeUntrustedText(value, max));
const optionalUuid = z.string().transform((value) => value || null).pipe(z.uuid().nullable());

export const productInputSchema = z.object({
  id: z.uuid().optional(),
  sku: text(80).pipe(z.string().min(1, "Informe o SKU.")),
  name: text(180).pipe(z.string().min(2, "Informe o nome.")),
  description: text(1000),
  barcode: text(80),
  categoryId: optionalUuid,
  unitId: optionalUuid,
  costPrice: z.coerce.number().min(0).max(999_999_999_999),
  salePrice: z.coerce.number().min(0).max(999_999_999_999),
  minimumStock: z.coerce.number().min(0).max(999_999_999),
  maximumStock: z.coerce.number().min(0).max(999_999_999),
  trackStock: z.boolean(),
  active: z.boolean(),
}).refine((value) => value.maximumStock === 0 || value.maximumStock >= value.minimumStock, { path: ["maximumStock"], message: "O estoque máximo deve ser maior ou igual ao mínimo." });

export const categoryInputSchema = z.object({
  id: z.uuid().optional(),
  code: text(40).pipe(z.string().min(1, "Informe o código.")),
  name: text(120).pipe(z.string().min(2, "Informe o nome.")),
  parentId: optionalUuid,
  active: z.boolean(),
});
