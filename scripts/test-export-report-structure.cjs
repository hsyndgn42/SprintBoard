/**
 * Generated HTML report structure and escaping contract (P-09, P-10).
 *
 * These files are handed to people outside the app, so two things matter:
 * the reader must be able to tell what the report covers without asking,
 * and no value may reach the page unescaped. Dataset-agnostic: read from
 * source, never from a running instance.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const presentation = read('frontend/src/app/pages/presentation-html.ts');
const reportTab = read('frontend/src/app/pages/report-tab-html.ts');

const failures = [];
const check = (label, condition) => { if (!condition) failures.push(label); };

// --- P-10: table cells are escaped unless explicitly marked raw ----------
check('table escapes cells by default',
  /cell instanceof RawHtml\?cell\.html:h\(cell\)/.test(presentation));
check('raw markup needs an explicit marker', /class RawHtml/.test(presentation) && /const raw=/.test(presentation));
check('the only raw producer is the estimate chip helper',
  (presentation.replace(/\/\*[\s\S]*?\*\//g, '').match(/\braw\(/g) || []).length === 2);
check('chip labels inside raw markup are still escaped',
  /<span class="chip">\$\{h\(s\)\} \$\{h\(c\?\?0\)\}<\/span>/.test(presentation));
check('no table call site double-escapes a plain cell',
  !/rows\.map\(r=>\[h\(r\.name\),h\(r\.end\)/.test(presentation));
check('report tab table already escaped and still does',
  /<td data-label="\$\{h\(headers\[i\]\)\}">\$\{h\(cell\)\}<\/td>/.test(reportTab));
check('table headers are escaped in both generators',
  /<th>\$\{h\(x\)\}<\/th>/.test(presentation) && /<th>\$\{h\(x\)\}<\/th>/.test(reportTab));

// --- §18: the reader can tell what the report is -------------------------
check('a report metadata strip exists', /function metaStrip/.test(presentation));
check('metadata values are escaped', /<dt>\$\{h\(label\)\}<\/dt><dd>\$\{h\(value\)\}<\/dd>/.test(presentation));
check('empty metadata rows are dropped, not shown blank',
  /\.filter\(\(\[,value\]\)=>value\)/.test(presentation));
check('sprint review states its period', presentation.includes("'Dönem',sprint.start+' — '+sprint.end"));
check('sprint review states the team', presentation.includes("'Ekip',settings.teamName"));
check('sprint review states when it was generated', /'Oluşturulma'/.test(presentation));
check('insights brief states its scope', presentation.includes("'Kapsam',rows.length+' tamamlanan sprint'"));
check('insights brief states data freshness', /'Veri tazeliği'/.test(presentation));
check('freshness warns the file does not self-update', /kendiliğinden güncellenmez/.test(presentation));

// --- §18: methodology ------------------------------------------------------
check('a definitions section exists', /function definitions/.test(presentation));
check('definition terms and meanings are escaped',
  /<dt>\$\{h\(term\)\}<\/dt><dd>\$\{h\(meaning\)\}<\/dd>/.test(presentation));
check('both documents define their terms',
  (presentation.match(/\$\{definitions\(\[/g) || []).length === 2);
for (const term of ['Teslimat işi', 'Teslimat oranı', 'Planlanan efor', 'Göreli tahmin']) {
  check(`term defined: ${term}`, presentation.includes(`'${term}'`));
}
check('zero-denominator behaviour is documented, not hidden',
  /oran hesaplanmaz ve — gösterilir/.test(presentation));
check('per-person figures are explicitly not a ranking',
  /performans ölçüsü değildir/.test(presentation));
check('planned effort is never presented as actual time',
  /Gerçekleşen süre değildir/.test(presentation));

// --- the file must stay standalone and safe ------------------------------
check('CSP is still declared', /Content-Security-Policy/.test(presentation));
check('CSP still forbids scripts', /default-src 'none'; img-src data:; style-src 'unsafe-inline'/.test(presentation));
check('no external font, CSS or script is referenced',
  !/https?:\/\/[^"')\s]*\.(css|js|woff2?)/.test(presentation));
check('no script tag is emitted', !/<script/i.test(presentation));
check('styles stay embedded', /<style>\$\{css\}<\/style>/.test(presentation));

// --- print behaviour -------------------------------------------------------
check('A4 page size is still declared', /@page\{size:A4 portrait;margin:12mm\}/.test(presentation));
check('metadata strip does not split across pages', /@media print\{\.report-meta\{break-inside:avoid/.test(presentation));
check('definitions do not split across pages', /\.definitions\{break-before:auto;break-inside:avoid\}/.test(presentation));
check('table headers still repeat on each printed page', /thead\{display:table-header-group\}/.test(presentation));
check('new blocks are responsive', /@media\(max-width:600px\)\{\.report-meta\{grid-template-columns:1fr\}/.test(presentation));

if (failures.length) {
  console.error('export report structure FAILED:\n - ' + failures.join('\n - '));
  process.exit(1);
}
console.log('export report structure OK (escape-by-default tables, report metadata, methodology, print and CSP preserved)');
