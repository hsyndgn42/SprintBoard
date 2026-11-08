// Lockfile inventory only; no installed package code is executed.
const fs = require('node:fs');
const lock = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const seen = new Set();
const components = [];
for (const [path, pkg] of Object.entries(lock.packages)) {
  if (!path || pkg.dev || !pkg.version) continue;
  const name = pkg.name || path.split('node_modules/').at(-1);
  const purl = `pkg:npm/${name.replace('@', '%40')}@${pkg.version}`;
  if (seen.has(purl)) continue;
  seen.add(purl);
  const component = { type: 'library', name, version: pkg.version, purl, 'bom-ref': purl };
  if (pkg.integrity?.startsWith('sha512-')) component.hashes = [{ alg: 'SHA-512', content: Buffer.from(pkg.integrity.slice(7), 'base64').toString('hex') }];
  components.push(component);
}
process.stdout.write(JSON.stringify(components));
