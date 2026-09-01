const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      results.push(file);
    }
  });
  return results;
}

const files = walk('src/app').filter(f => f.endsWith('.ts') || f.endsWith('.tsx'));
files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  let newContent = content
    .replace(/href="\/erp\/([\w-]+)/g, 'href="/')
    .replace(/href="\/erp"/g, 'href="/"')
    .replace(/active="erp-([\w-]+)"/g, 'active="$1"')
    .replace(/active="erp"/g, 'active="dashboard"')
    .replace(/revalidatePath\("\/erp/g, 'revalidatePath("/')
    .replace(/basePath="\/erp\//g, 'basePath="/');
  
  if (content !== newContent) {
    fs.writeFileSync(f, newContent);
    console.log('Updated', f);
  }
});
