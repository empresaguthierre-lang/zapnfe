import { z } from "zod";
import { normalizeUntrustedText } from "@/lib/security/input";

const text = (max: number) => z.string().transform((value) => normalizeUntrustedText(value, max));

export const branchInputSchema = z.object({
  id: z.uuid().optional(),
  code: text(30).pipe(z.string().min(1, "Informe o código.")),
  name: text(120).pipe(z.string().min(2, "Informe o nome.")),
  tradeName: text(120),
  document: text(20),
  email: text(160).refine((value) => !value || z.email().safeParse(value).success, "E-mail inválido."),
  phone: text(20),
  isHeadquarters: z.boolean(),
  active: z.boolean(),
});

export const moduleInputSchema = z.object({
  moduleId: z.uuid(),
  enabled: z.boolean(),
});
