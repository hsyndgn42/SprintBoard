// Regression guard: inventories every backend call made from the Angular sources.
// Used to prove UI-only changes did not alter API usage or request payload shapes.
const { readdirSync, readFileSync, statSync } = require('node:fs');
const { join, relative } = require('node:path');

const root = join(__dirname, '..', 'frontend', 'src');

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|html)$/.test(entry)) out.push(full);
  }
  return out;
}

const callRe = /\bapi\s*\.\s*(get|post|put|patch|delete)\s*(?:<[^>]*>)?\s*\(\s*([`'"])((?:\\.|(?!\2)[^\\])*)\2/g;
const rows = [];
for (const file of walk(root)) {
  const text = readFileSync(file, 'utf8');
  let m;
  while ((m = callRe.exec(text)) !== null) {
    const line = text.slice(0, m.index).split('\n').length;
    // normalise template-literal interpolations so ids do not create noise
    const path = m[3].replace(/\$\{[^}]*\}/g, '{x}');
    rows.push({ file: relative(root, file).replace(/\\/g, '/'), line, method: m[1].toUpperCase(), path });
  }
}
rows.sort((a, b) => (a.method + a.path + a.file).localeCompare(b.method + b.path + b.file));

const unique = [...new Set(rows.map(r => `${r.method} ${r.path}`))].sort();
console.log('# API call inventory');
console.log(`# total call sites: ${rows.length}`);
console.log(`# unique method+path: ${unique.length}`);
console.log('');
console.log('## unique endpoints');
for (const u of unique) console.log(u);
console.log('');
console.log('## call sites');
for (const r of rows) console.log(`${r.method} ${r.path}\t${r.file}:${r.line}`);
