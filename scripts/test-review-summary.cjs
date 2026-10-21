/**
 * Sprint review executive summary and exceptions (phase 2, R-01/R-02).
 *
 * Behavioural, not textual: the model is executed against synthetic sprints.
 * The contract under protection is that a metric is never published without a
 * guarded denominator, that unavailable data reads as unknown rather than as
 * zero, and that no risk is produced unless a condition was actually recorded.
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
const {
  reviewSummary, reviewExceptions, REVIEW_DEFINITIONS, UNKNOWN,
} = require('../frontend/src/app/pages/review-summary.model.ts');

const settings = { estimationMode: 'SIZE_AND_HOURS', hoursPerDay: 8, teamName: 'T' };
const task = (id, f = {}) => ({
  id, name: id, taskCategory: 'DEV', taskSubtype: null, workKind: 'DEV', status: 'done',
  estimatedHours: 8, size: 'MEDIUM', storyPoints: null, assignments: [{ memberName: 'A', estimatedHours: 8 }], ...f,
});
const sprint = (items, f = {}) => ({ id: 1, name: 'S', start: '2024-01-01', end: '2024-01-14', status: 'completed', items, ...f });
const byKey = (rows, key) => rows.find(r => r.key === key);

// --- every metric must explain itself ------------------------------------
{
  const metrics = reviewSummary(sprint([task('a'), task('b', { status: 'undone' })]), settings);
  assert.ok(metrics.length, 'summary produces metrics');
  for (const m of metrics) {
    assert.ok(m.label && m.label.trim(), `${m.key} has a label`);
    assert.ok(m.display !== undefined && m.display !== '', `${m.key} has a display value`);
    assert.ok(m.detail && m.detail.trim().length > 10,
      `${m.key} states its formula, unit and scope`);
  }
  assert.equal(byKey(metrics, 'rate').display, '50%');
  assert.equal(byKey(metrics, 'done').display, '1');
  assert.equal(byKey(metrics, 'pending').display, '1');
}

// --- zero denominator reads as unknown, never as 0% ----------------------
{
  // BAU only: there is no delivery work, so a delivery rate cannot exist.
  const metrics = reviewSummary(sprint([task('bau', { taskCategory: 'BAU', taskSubtype: 'MEETING' })]), settings);
  const rate = byKey(metrics, 'rate');
  assert.equal(rate.display, UNKNOWN, 'no delivery work => rate is unknown');
  assert.equal(rate.known, false);
  assert.notEqual(rate.display, '0%', 'unknown must never be rendered as zero');
}
{
  const metrics = reviewSummary(sprint([]), settings);
  const rate = byKey(metrics, 'rate');
  assert.equal(rate.known, false, 'empty sprint => rate unknown');
  for (const m of metrics) assert.ok(m.display !== 'NaN' && m.display !== 'Infinity', `${m.key} is finite`);
}

// --- zero is distinguished from unavailable ------------------------------
{
  // A sprint with real delivery work and nothing done is a true 0%.
  const metrics = reviewSummary(sprint([task('a', { status: 'undone' })]), settings);
  const rate = byKey(metrics, 'rate');
  assert.equal(rate.known, true, 'real denominator => the rate is known');
  assert.equal(rate.display, '0%', 'a genuine zero is shown as zero');
}

// --- untracked scope is unknown, not zero --------------------------------
{
  const metrics = reviewSummary(sprint([task('a')]), settings); // no flow => untracked
  for (const key of ['added', 'removed']) {
    const m = byKey(metrics, key);
    if (m) {
      assert.equal(m.known, false, `${key} is unknown without scope tracking`);
      assert.equal(m.display, UNKNOWN, `${key} does not claim zero scope change`);
    }
  }
}

// --- exceptions are recorded facts only ----------------------------------
{
  const clean = reviewExceptions(sprint([task('a')]), settings);
  for (const x of clean) {
    assert.notEqual(x.key, 'blocked', 'no blocker is invented when none is recorded');
    assert.notEqual(x.key, 'prodDefect', 'no defect is invented when none is recorded');
  }
}
{
  const rows = reviewExceptions(sprint([
    task('blocked', { status: 'doing', blocker: { blocked: true, reason: 'r', updatedAt: '', version: 1 } }),
    task('free', { assignments: [] }),
    task('bug', { taskCategory: 'DEFECT', taskSubtype: 'PROD_DEFECT' }),
  ]), settings);
  assert.ok(byKey(rows, 'blocked'), 'a recorded blocker surfaces');
  assert.equal(byKey(rows, 'blocked').count, 1);
  assert.ok(byKey(rows, 'unassigned'), 'an unassigned task surfaces');
  assert.ok(byKey(rows, 'prodDefect'), 'a production defect surfaces');
  for (const x of rows) {
    assert.ok(x.detail && x.detail.trim(), `${x.key} describes the condition`);
    assert.ok(Array.isArray(x.names), `${x.key} exposes its records`);
    assert.ok(!/muhtemelen|sebebiyle|yüzünden|başarısız|kötü|zayıf/i.test(x.detail),
      `${x.key} states a fact and does not suggest a cause or a judgement`);
  }
}

// --- no combined health score, no colour-only judgement ------------------
{
  const metrics = reviewSummary(sprint([task('a'), task('b', { status: 'undone' })]), settings);
  for (const m of metrics) {
    assert.ok(!/sağlık|skor|score|health|puan/i.test(m.key + m.label),
      `${m.key} is not a combined health score`);
  }
}

// --- definitions cover what the summary publishes ------------------------
{
  assert.ok(REVIEW_DEFINITIONS.length >= 6, 'definitions are provided');
  for (const [term, meaning] of REVIEW_DEFINITIONS) {
    assert.ok(term && term.trim(), 'definition has a term');
    assert.ok(meaning && meaning.length > 20, `definition of ${term} is meaningful`);
  }
}

console.log('review summary OK (guarded denominators, unknown is not zero, fact-only exceptions, no health score)');
