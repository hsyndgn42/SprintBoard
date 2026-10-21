// Regression coverage for status badge semantics.
//
// Before this change `.status.active` shared the green `.done` treatment and
// `.status.pending` / `.status.rejected` were never declared at all, so a
// rejected request was indistinguishable from a pending one and an emergency
// task looked completed. These assertions stop that regressing.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..', 'frontend', 'src');
const css = readFileSync(join(root, 'sb-foundation.css'), 'utf8');

/** Parses top-level CSS rules into { selectors, body } pairs. */
function parseRules(source) {
  // Strip comments first: otherwise a preceding /* ... */ gets swallowed into
  // the selector text and breaks exact matching.
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(clean)) !== null) {
    // Drop any at-rule prelude (e.g. "@media (...) {") left on the selector.
    const selectors = m[1].replace(/^[\s\S]*@[\w-]+[^{]*$/, '').trim() || m[1].trim();
    rules.push({ selectors, body: m[2] });
  }
  return rules;
}

const RULES = parseRules(css);

/** Finds the last rule whose comma-separated selector list contains `selector`. */
function rule(selector) {
  const found = RULES.filter(r =>
    r.selectors.split(',').some(s => s.trim() === selector));
  assert.ok(found.length, `no CSS rule found for ${selector}`);
  return found[found.length - 1];
}

function colorOf(selector) {
  const { body } = rule(selector);
  const m = body.match(/(?:^|;)\s*color\s*:\s*([^;]+)/);
  assert.ok(m, `${selector} declares no color`);
  return m[1].trim();
}

// Every state that users must tell apart gets its own colour token.
const done = colorOf('.status.done');
const doing = colorOf('.status.doing');
const todo = colorOf('.status.todo');
const undone = colorOf('.status.undone');
const active = colorOf('.status.active');
const emergency = colorOf('.status.emergency');

const distinct = new Set([done, doing, todo, undone]);
assert.equal(distinct.size, 4, `done/doing/todo/undone must use four distinct colours, got ${[...distinct].join(', ')}`);

assert.notEqual(active, done, '.status.active must not reuse the completed (.done) colour');
assert.notEqual(emergency, done, '.status.emergency must not reuse the completed (.done) colour');

// pending and rejected must exist and differ from each other.
const pending = colorOf('.status.pending');
const rejected = colorOf('.status.rejected');
assert.notEqual(pending, rejected, 'pending and rejected requests must be visually distinguishable');

// State must not be conveyed by hue alone.
assert.match(css, /\.status::before\s*\{[^}]*content\s*:/, 'status badges need a non-colour (dot) indicator');

// The sprint board must render the amber emergency variant, not `.status active`.
const board = readFileSync(join(root, 'app', 'pages', 'sprint-board.component.html'), 'utf8');
assert.match(board, /class="status emergency"/, 'emergency badge should use the .emergency variant');

// Backlog must distinguish in-flight from queued work.
const backlog = readFileSync(join(root, 'app', 'pages', 'backlog.component.ts'), 'utf8');
for (const binding of ['class.done', 'class.undone', 'class.doing', 'class.todo']) {
  assert.ok(backlog.includes(`[${binding}]`), `backlog status badge must bind [${binding}]`);
}

console.log('status semantics OK (6 board states, 2 request states, non-colour indicator)');
