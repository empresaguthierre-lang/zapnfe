import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkAll() {
  const { data, error } = await supabase.from('whatsapp_inbound_messages').select('*');
  console.log("whatsapp_inbound_messages:", data?.length, error);
}
checkAll();