const fs = require('fs');

const content = \import { createClient } from '@supabase/supabase-js';
import sql from 'mssql';
import 'dotenv/config';

const SQL_CONNECTION = process.env.ERP_SQL_CONNECTION_STRING;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORG_SLUG = 'zapala';

async function main() {
  if (!SQL_CONNECTION || !SUPABASE_URL || !SUPABASE_KEY) {
    console.error('ERRO: Variaveis de ambiente faltando.');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

  console.log('Buscando organizacao Zapala...');
  let { data: org, error: orgError } = await supabase.from('organizations').select('id').eq('slug', ORG_SLUG).maybeSingle();
  
  if (!org) {
    console.log('Organizacao Zapala nao encontrada. Por favor, crie-a primeiro.');
    process.exit(1);
  }

  console.log(\Organizacao encontrada: \\);
  
  console.log('Conectando ao SQL Server Petrus...');
  const pool = await sql.connect(SQL_CONNECTION);
  
  console.log('Buscando produtos ativos no Petrus...');
  const result = await pool.request().query(\
    SELECT 
      p.CODIGO as sku,
      p.DESCRICAO as name,
      p.CODIGOBARRAS as barcode,
      p.PRECOVENDA as sale_price,
      p.UNIDADE as unit_code,
      p.ESTOQUEMINIMO as minimum_stock,
      p.ATIVO as active,
      g.DESCRICAO as category_name
    FROM PRODUTO p
    LEFT JOIN GRUPOPRODUTO g ON p.CODIGOGRUPO = g.CODIGO
    WHERE p.ATIVO = 'S'
  \);
  
  const products = result.recordset;
  console.log(\Encontrados \ produtos ativos.\);
  
  console.log('Iniciando importacao para o Supabase...');
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const prod of products) {
    const { error } = await supabase.from('products').upsert({
      organization_id: org.id,
      sku: prod.sku?.toString(),
      name: prod.name?.trim(),
      barcode: prod.barcode?.trim() || null,
      sale_price: parseFloat(prod.sale_price || 0),
      unit_code: prod.unit_code?.trim() || 'UN',
      minimum_stock: parseFloat(prod.minimum_stock || 0),
      track_stock: true,
      active: true,
      category_name: prod.category_name?.trim() || null
    }, { onConflict: 'organization_id,sku' });
    
    if (error) {
      console.error(\Erro ao importar \:\, error.message);
      errorCount++;
    } else {
      successCount++;
    }
  }
  
  console.log(\Importacao concluida! Sucesso: \, Erros: \\);
  process.exit(0);
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
\;

fs.writeFileSync('C:/Users/guthierre/Documents/Codex/2026-04-22-files-mentioned-by-the-user-relatorio/estoque/scripts/import_zapala.mjs', content, 'utf8');
