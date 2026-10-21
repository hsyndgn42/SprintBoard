/**
 * Standalone sprint review HTML (phase 2, R-03/R-04/R-05).
 *
 * The generator is executed, not pattern-matched, so the assertions describe
 * the document a reader actually receives: self-contained, escaped, A4
 * printable, and free of empty decorative sections.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('../frontend/node_modules/typescript');
require.extensions['.ts'] = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  module._compile(out.outputText, filename);
};
const { editorialSprintHtml } = require('../frontend/src/app/pages/presentation-html.ts');

const settings = { estimationMode: 'SIZE_AND_HOURS', hoursPerDay: 8, teamName: 'Takım' };
const task = (id, f = {}) => ({
  id, name: id, taskCategory: 'DEV', taskSubtype: null, workKind: 'DEV', status: 'done',
  estimatedHours: 8, size: 'MEDIUM', storyPoints: null,
  assignments: [{ memberName: 'A', estimatedHours: 8 }], ...f,
});
const sprint = (items, f = {}) => ({
  id: 1, name: 'Sprint 1', start: '2024-01-01', end: '2024-01-14',
  status: 'completed', goal: 'Hedef', items, ...f,
});
const at = '2024-01-15T09:00:00.000Z';

// --- narrative sections are present when data exists ---------------------
{
  const html = editorialSprintHtml(sprint([
    task('teslim'),
    task('devreden', { status: 'undone' }),
    task('bug', { taskCategory: 'DEFECT', taskSubtype: 'PROD_DEFECT', status: 'doing' }),
  ]), settings, at);

  assert.ok(html.includes('id="exec-summary"'), 'executive summary section');
  assert.ok(html.includes('Yönetici özeti'), 'executive summary heading');
  assert.ok(html.includes('id="appendix"'), 'detailed appendix section');
  assert.ok(html.includes('Detaylı döküm'), 'appendix heading');
  assert.ok(html.includes('Tanımlar ve yöntem'), 'metric definitions');
  assert.ok(html.includes('Teslimat işleri'), 'delivered work');
  assert.ok(html.includes('Devreden / açık'), 'incomplete work');
  assert.ok(/Oluşturulma/.test(html), 'generated timestamp');
  assert.ok(html.includes('Sprint 1'), 'sprint identity');
  assert.ok(html.includes('2024-01-01'), 'date range');

  // every appendix record appears
  for (const id of ['teslim', 'devreden', 'bug']) {
    assert.ok(html.includes(id), `appendix lists ${id}`);
  }
}

// --- empty sections are omitted, not rendered as blank cards -------------
{
  const html = editorialSprintHtml(sprint([]), settings, at);
  assert.ok(!html.includes('id="appendix"'), 'no appendix when there are no records');
  assert.ok(!html.includes('Sprint ekibi'), 'no team showcase without team data');
  assert.ok(!html.includes('İş tipi dağılımı'), 'no work-type chart without work');
  assert.ok(html.includes('Bu sprintte görev yok'), 'the empty sprint is stated plainly');
  // A document with no data must still identify itself.
  assert.ok(html.includes('Sprint 1') && /Oluşturulma/.test(html), 'identity survives an empty sprint');
}

// --- hostile input is escaped everywhere ---------------------------------
{
  const hostile = '<script>alert(1)</script>" onmouseover="alert(2)" \'&<>';
  const html = editorialSprintHtml(
    sprint([task(hostile, { taskSubtype: null })], { name: hostile, goal: hostile }),
    { ...settings, teamName: hostile },
    at,
  );
  assert.ok(!/<script/i.test(html), 'no script tag survives');
  assert.ok(!html.includes('onmouseover="alert'), 'no event-handler attribute is injected');
  assert.ok(!html.includes('<script>alert(1)'), 'raw payload never appears');
  assert.ok(html.includes('&lt;script&gt;'), 'the payload is shown escaped');
  assert.ok(html.includes('&amp;') && html.includes('&quot;') && html.includes('&#39;'),
    'quotes and ampersands are escaped');

  // Attribute context specifically: every data-label must stay closed.
  for (const m of html.matchAll(/data-label="([^"]*)"/g)) {
    assert.ok(!m[1].includes('<'), 'attribute values carry no markup');
  }
}

// --- long text, Turkish characters and newlines --------------------------
{
  const long = 'Ç'.repeat(400) + '\nikinci satır ğüşıöç İĞÜŞÖÇ';
  const html = editorialSprintHtml(sprint([task(long)]), settings, at);
  assert.ok(html.includes('ğüşıöç'), 'Turkish characters are preserved');
  assert.ok(html.includes('overflow-wrap:anywhere'), 'long words are allowed to wrap');
  assert.ok(!/<script/i.test(html), 'long hostile-ish input stays safe');
}

// --- self-contained and offline ------------------------------------------
{
  const html = editorialSprintHtml(sprint([task('a')]), settings, at);
  assert.ok(!/<script/i.test(html), 'no JavaScript');
  assert.ok(!/\ssrc=["'](?!data:)/i.test(html), 'no external resource is referenced');
  assert.ok(!/<link\b/i.test(html), 'no external stylesheet');
  assert.ok(!/https?:\/\//.test(html.replace(/http-equiv/g, '')), 'no network URL');
  assert.ok(html.includes('Content-Security-Policy'), 'CSP present');
  assert.ok(html.includes("default-src 'none'"), 'CSP forbids everything by default');
  assert.ok(html.includes('<style>'), 'styles are embedded');
}

// --- no secret may reach the document ------------------------------------
{
  const html = editorialSprintHtml(sprint([task('a')]), {
    ...settings,
    slackToken: 'xoxb-SECRET', slackSigningSecret: 'SIGNSECRET',
    passwordHash: '$2a$HASH', encryptionKey: 'KEY',
  }, at);
  for (const secret of ['xoxb-SECRET', 'SIGNSECRET', '$2a$HASH', 'KEY']) {
    assert.ok(!html.includes(secret), `secret not exported: ${secret}`);
  }
  assert.ok(!/slackToken|passwordHash|encryptionKey/i.test(html), 'no secret field name leaks');
}

// --- accessible tables ----------------------------------------------------
{
  const html = editorialSprintHtml(sprint([task('a')]), settings, at,
    [], null, undefined, { sprintName: 'Sprint 1', earned: 4, supportHours: 2, people: [{ name: 'A', hours: 2, xCount: 1 }] });
  const headers = html.match(/<th\b[^>]*>/g) || [];
  assert.ok(headers.length, 'the document contains tables');
  for (const th of headers) {
    assert.ok(/scope="col"/.test(th), `every header cell is scoped: ${th}`);
  }
  assert.ok(html.includes('<caption'), 'tables are captioned');
}

// --- A4 print behaviour ---------------------------------------------------
{
  const html = editorialSprintHtml(sprint([task('a')]), settings, at);
  assert.ok(html.includes('@page{size:A4 portrait;margin:12mm}'), 'A4 page box');
  assert.ok(html.includes('thead{display:table-header-group}'), 'table headers repeat per page');
  assert.ok(html.includes('.appendix{break-before:page}'), 'the appendix starts on its own page');
  assert.ok(/\.exec-grid article\{[^}]*break-inside:avoid/.test(html),
    'summary cards are not split across pages');
  assert.ok(html.includes('body{background:white'), 'print uses a light background');
  assert.ok(html.includes('summary{display:none!important}'), 'collapsible controls are hidden in print');
  assert.ok(html.includes('details>*{display:block!important}'), 'collapsed content still prints');
}

console.log('export review structure OK (narrative sections, empty-section omission, escaping, offline, no secrets, A4 print)');
