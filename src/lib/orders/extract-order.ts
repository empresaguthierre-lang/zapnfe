import { GoogleGenAI, Type } from "@google/genai";
import { z } from "zod";
import { getGeminiEnv } from "@/lib/env";

export type CatalogProduct = { id: string; sku: string; name: string; aliases: string[]; unit: string; price: number };

const extractedItemSchema = z.object({
  product_id: z.string(),
  description: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  match_confidence: z.number().min(0).max(1),
});

const extractedOrderSchema = z.object({
  is_order: z.boolean(),
  customer_name: z.string(),
  notes: z.string(),
  confidence: z.number().min(0).max(1),
  items: z.array(extractedItemSchema),
});

export type ExtractedOrder = z.infer<typeof extractedOrderSchema>;

export async function extractOrderFromText(message: string, products: CatalogProduct[]) {
  const { apiKey, model } = getGeminiEnv();
  const ai = new GoogleGenAI({ apiKey });
  const catalog = products.map(({ id, sku, name, aliases, unit }) => ({ id, sku, name, aliases, unit }));
  const prompt = [
    "Você extrai pedidos comerciais recebidos por WhatsApp.",
    "Use somente product_id existente no catálogo. Se não houver correspondência segura, use string vazia.",
    "Não invente itens, quantidades, nomes, unidades ou clientes.",
    "Se a mensagem não for um pedido, marque is_order=false e retorne items vazio.",
    "Interprete abreviações e aliases, mas reduza match_confidence quando houver ambiguidade.",
    `CATÁLOGO: ${JSON.stringify(catalog)}`,
    `MENSAGEM: ${message}`,
  ].join("\n\n");

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      temperature: 0.1,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          is_order: { type: Type.BOOLEAN },
          customer_name: { type: Type.STRING },
          notes: { type: Type.STRING },
          confidence: { type: Type.NUMBER },
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                product_id: { type: Type.STRING }, description: { type: Type.STRING }, quantity: { type: Type.NUMBER },
                unit: { type: Type.STRING }, match_confidence: { type: Type.NUMBER },
              },
              required: ["product_id", "description", "quantity", "unit", "match_confidence"],
            },
          },
        },
        required: ["is_order", "customer_name", "notes", "confidence", "items"],
      },
    },
  });

  if (!response.text) throw new Error("Gemini retornou uma resposta vazia.");
  return extractedOrderSchema.parse(JSON.parse(response.text));
}
