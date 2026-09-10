const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
async function check() {
  const { data, error } = await supabase.from("orders").select("status, count").select('status');
  const counts = {};
  if(data) data.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
  console.log("Counts:", counts);
}
check();
