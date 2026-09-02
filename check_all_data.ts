import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkAllTables() {
  const { data: tables, error } = await supabase.from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public');
  
  if (error) {
    // se information schema falhar, tentar buscar a mão
    console.log("Falha no information_schema, listando hardcoded tables");
    const testTables = ['orders', 'invoices', 'pedidos', 'whatsapp_orders', 'customers', 'products'];
    for (const t of testTables) {
      const { count } = await supabase.from(t).select('*', { count: 'exact', head: true });
      console.log(`Table ${t}: ${count} rows`);
    }
  } else {
    for (const row of tables) {
      const t = row.table_name;
      const { count } = await supabase.from(t).select('*', { count: 'exact', head: true });
      if (count && count > 0) {
        console.log(`Table ${t}: ${count} rows`);
      }
    }
  }
}
checkAllTables();