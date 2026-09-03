/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-require-imports */
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function exportOrders() {
  console.log("Buscando pedidos em aberto...");
  const { data: orders, error } = await supabase
    .from("orders")
    .select(`
      id,
      number,
      status,
      total,
      created_at,
      customer:customers(name)
    `)
    .in("status", ["received", "review", "approved"]);

  if (error) {
    console.error("Erro ao buscar pedidos:", error);
    return;
  }

  if (!orders || orders.length === 0) {
    console.log("Nenhum pedido em aberto encontrado.");
    fs.writeFileSync("estoque-app-pedidos.csv", "Nenhum pedido em aberto encontrado.\n", "utf8");
    return;
  }

  console.log(`Encontrados ${orders.length} pedidos em aberto.`);

  const csvRows = [
    ["ID", "Numero", "Cliente", "Status", "Total", "Data"]
  ];

  for (const order of orders) {
    csvRows.push([
      order.id,
      order.number,
      (order.customer as any)?.name || "Desconhecido",
      order.status,
      order.total,
      new Date(order.created_at).toLocaleString("pt-BR")
    ]);
  }

  const csvContent = csvRows.map(row => row.map(cell => `"${cell}"`).join(",")).join("\n");
  
  fs.writeFileSync("estoque-app-pedidos.csv", csvContent, "utf8");
  console.log("Planilha gerada com sucesso: estoque-app-pedidos.csv");
}

exportOrders();
