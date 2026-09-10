import fs from 'fs';
import readline from 'readline';

const csvPath = 'arquitetura.csv.csv';

async function processCSV() {
  const fileStream = fs.createReadStream(csvPath, { encoding: 'utf-8' }); 
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const tables = {};
  let isFirstLine = true;

  for await (let line of rl) {
    if (isFirstLine) {
      isFirstLine = false;
      continue;
    }
    
    const row = [];
    let curVal = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') {
        inQuotes = !inQuotes;
      } else if (line[i] === ',' && !inQuotes) {
        row.push(curVal);
        curVal = '';
      } else {
        curVal += line[i];
      }
    }
    row.push(curVal);

    if (row.length < 7) continue;

    const modulo = row[0].replace(/^"|"$/g, '').trim();
    const tabela = row[1].replace(/^"|"$/g, '').trim();
    const descricao = row[2].replace(/^"|"$/g, '').trim();
    const coluna = row[3].replace(/^"|"$/g, '').trim();
    const tipo = row[4].replace(/^"|"$/g, '').trim();
    const isPK = row[5].replace(/^"|"$/g, '').trim() === 'SIM';
    const rel = row[6] ? row[6].replace(/^"|"$/g, '').trim() : '';

    if (!tables[tabela]) {
      tables[tabela] = { modulo, descricao, columns: [], fks: [], pks: [], allColumns: [] };
    }

    tables[tabela].allColumns.push({ name: coluna, type: tipo, rel });
    tables[tabela].columns.push(coluna);
    if (isPK) tables[tabela].pks.push(coluna);
    if (rel) {
      if (!tables[tabela].fks.includes(rel)) {
        tables[tabela].fks.push(rel);
      }
    }
  }

  let md = '# Catálogo de Tabelas (Legado Petrus)\n\n';
  
  const byModule = {};
  for (const t in tables) {
    const mod = tables[t].modulo;
    if (!byModule[mod]) byModule[mod] = [];
    byModule[mod].push({ name: t, ...tables[t] });
  }

  for (const mod in byModule) {
    md += `## Módulo: ${mod}\n\n`;
    for (const t of byModule[mod]) {
      md += `### Tabela ${t.name} - ${t.descricao}\n`;
      md += `- **Colunas**: ${t.columns.length}\n`;
      if (t.pks.length > 0) md += `- **PK**: ${t.pks.join(', ')}\n`;
      if (t.fks.length > 0) md += `- **FKs para**: ${t.fks.join(', ')}\n`;
      const importantCols = t.allColumns.filter(c => !c.name.includes('DATA_INCLUSAO') && !c.name.includes('USUARIO_')).map(c => `${c.name}${c.rel ? ' (->' + c.rel + ')' : ''}`).join(', ');
      md += `- **Principais Colunas**: ${importantCols}\n\n`;
    }
  }

  fs.writeFileSync('tables_catalog.md', md);
  console.log('Catálogo gerado em tables_catalog.md');
}

processCSV();
