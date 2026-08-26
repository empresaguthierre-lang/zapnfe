import { GoogleGenAI, Type } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";

if (!apiKey) {
  console.error("GEMINI_API_KEY não está configurada no ambiente.");
  process.exit(1);
}

const products = [
  { id: "prod-coca-2l", sku: "COCA2L-CX6", name: "Coca-Cola 2L — caixa com 6", aliases: ["coca 2l", "caixa de coca"], unit: "CX" },
  { id: "prod-coca-lata", sku: "COCALATA-FD12", name: "Coca-Cola lata 350ml — fardo com 12", aliases: ["fardo da lata", "coca lata"], unit: "FD" },
  { id: "prod-agua-500", sku: "AGUA500-FD12", name: "Água mineral 500ml — fardo com 12", aliases: ["água", "fardo de água"], unit: "FD" },
];

const message = "Mercado São João: me manda 5 caixas da Coca 2L, 3 fardos da lata e 2 águas. Entregar amanhã cedo.";
const prompt = [
  "Você extrai pedidos comerciais recebidos por WhatsApp.",
  "Use somente product_id existente no catálogo. Se não houver correspondência segura, use string vazia.",
  "Não invente itens, quantidades, nomes, unidades ou clientes.",
  "Se a mensagem não for um pedido, marque is_order=false e retorne items vazio.",
  `CATÁLOGO: ${JSON.stringify(products)}`,
  `MENSAGEM: ${message}`,
].join("\n\n");

const ai = new GoogleGenAI({ apiKey });

try {
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
                product_id: { type: Type.STRING },
                description: { type: Type.STRING },
                quantity: { type: Type.NUMBER },
                unit: { type: Type.STRING },
                match_confidence: { type: Type.NUMBER },
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
  const result = JSON.parse(response.text);
  console.log(JSON.stringify({ model, message, result }, null, 2));
} catch (error) {
  const rawMessage = error instanceof Error ? error.message : String(error);
  console.error(rawMessage.replaceAll(apiKey, "[redacted]"));
  process.exit(1);
}
