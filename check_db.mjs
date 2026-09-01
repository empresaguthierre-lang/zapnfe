import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
    const { data: cols } = await supabase.rpc("get_schema_columns", { table_name: "stock_reservations" }).catch(() => ({}));
    if(!cols) {
      // Direct query to a generic table isn't possible with just the JS client unless we select * from it.
      const { data, error } = await supabase.from("stock_reservations").select("*").limit(1);
      console.log("Error or Empty:", error);
      console.log("Data sample:", data);
    }
}
main();
