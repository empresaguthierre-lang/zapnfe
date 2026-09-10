const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
async function check() {
  let { data, error } = await supabase.from("orders").select("*");
  console.log("Orders:", data?.length);
}
check();
