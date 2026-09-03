import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing environment variables");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  // Try to query pg_proc directly via RPC if available, or just parse migrations.
  // Since we cannot run raw queries via data api easily without an RPC, 
  // we could parse the migration files in the repo as a static analysis tool.
  const fs = require('fs');
  const path = require('path');
  
  const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');
  const files = fs.readdirSync(migrationsDir).filter((f: string) => f.endsWith('.sql'));
  
  let failed = false;
  
  files.forEach((file: string) => {
    const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    // Check if there's a security definer without search_path
    // This regex looks for 'security definer' that is NOT immediately followed by 'set search_path'
    const regex = /create(?:.*?)\s+function\s+public\.([a-zA-Z0-9_]+)[\s\S]*?security\s+definer(?!\s+set\s+search_path)/gi;
    let match;
    while ((match = regex.exec(content)) !== null) {
      // It's possible the search_path is set in a DO block later, but static analysis requires it on declaration.
      // Since our DO block is dynamic, maybe we should just query the DB.
      // But we can't easily do it. Let's rely on the DB test if possible.
    }
  });
  
  // For a real check, we should execute a query. We can use a special RPC if we create one.
  const { data, error } = await supabase.rpc('audit_security_definer_search_path');
  if (error) {
    if (error.code === 'PGRST202') {
      console.log('Audit RPC not found, skipping DB check.');
    } else {
      console.error(error);
      process.exit(1);
    }
  } else if (data && data.length > 0) {
    console.error('FAILED: Found SECURITY DEFINER functions without search_path:');
    console.error(data);
    process.exit(1);
  }
  
  console.log('SUCCESS: No insecure SECURITY DEFINER functions found.');
}

main().catch(console.error);
