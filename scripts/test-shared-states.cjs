// Regression coverage for the shared loading/empty/error state system.
//
// Before this component every list hand-rolled its own `<p class="empty">`,
// so "still loading", "nothing exists", "filtered out" and "the request
// failed" all looked identical. Each of those needs different wording and a
// different next action, so the distinctions are asserted here.
//
// Dependency-free, matching the other scripts/test-*.cjs harnesses.
const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');

const SRC = join(__dirname, '..', 'frontend', 'src', 'app');
const component = readFileSync(join(SRC, 'shared', 'sb-state.component.ts'), 'utf8');

// --- the variant set ------------------------------------------------------
const VARIANTS = ['loading', 'empty', 'no-results', 'denied', 'offline', 'error', 'partial'];
for (const variant of VARIANTS) {
  assert.ok(
    new RegExp(`['"]?${variant}['"]?\\s*:\\s*\\{`).test(component),
    `missing preset for variant ${variant}`,
  );
}

// --- accessibility --------------------------------------------------------
// Failures must interrupt a screen reader; progress and emptiness must not.
const presetBlock = (variant) => {
  const match = component.match(new RegExp(`['"]?${variant}['"]?\\s*:\\s*\\{([\\s\\S]*?)\\n  \\}`));
  assert.ok(match, `could not read preset block for ${variant}`);
  return match[1];
};

assert.match(presetBlock('error'), /role:\s*'alert'/, 'error must use role=alert');
assert.match(presetBlock('offline'), /role:\s*'alert'/, 'offline must use role=alert');
assert.match(presetBlock('error'), /live:\s*'assertive'/, 'error must announce assertively');
assert.match(presetBlock('loading'), /role:\s*'status'/, 'loading must use role=status');
assert.match(presetBlock('loading'), /live:\s*'polite'/, 'loading must not interrupt');
// A genuinely empty list is not an event: announcing it would be noise.
assert.match(presetBlock('empty'), /live:\s*'off'/, 'empty must not be announced as a live region');
// A filtered-out list IS the result of a user action, so it is announced.
assert.match(presetBlock('no-results'), /live:\s*'polite'/, 'no-results must be announced politely');

// Icons are decorative; the meaning always comes from the text.
assert.match(component, /aria-hidden="true"/, 'decorative glyphs must be hidden from assistive tech');

// The spinner animates, so reduced-motion needs an explicit fallback that
// still communicates progress rather than freezing into a static ring.
assert.match(
  component,
  /@media \(prefers-reduced-motion: reduce\)[\s\S]*sb-state__spinner/,
  'spinner must have a reduced-motion fallback',
);

// --- message semantics ----------------------------------------------------
// `undefined` means "use the preset"; `null` means "hide the message".
assert.match(component, /this\.message === null/, 'null message must hide the explanation');
assert.match(component, /this\.message === undefined/, 'undefined message must fall back to the preset');

// An unknown variant must degrade to a rendered state, never to a blank box.
assert.match(component, /PRESETS\[this\.variant\] \?\? PRESETS\.empty/, 'unknown variants must fall back to empty');

// --- empty-state copy quality --------------------------------------------
// Empty states explain the situation and suggest a next step; they never
// blame the reader. These are the Turkish second-person imperatives that
// previously read as accusations.
const BLAMING = ['hatalı giriş', 'yanlış yaptınız', 'geçersiz kullanım'];
for (const phrase of BLAMING) {
  assert.ok(!component.toLocaleLowerCase('tr-TR').includes(phrase), `empty-state copy must not blame the reader: ${phrase}`);
}

// --- adoption -------------------------------------------------------------
// A shared state system that nothing imports is worse than none at all, so
// assert real adoption across the primary data screens.
const ADOPTERS = [
  'overview.component.ts',
  'backlog.component.ts',
  'sprints.component.ts',
  'operations.component.ts',
  'insights.component.ts',
];

for (const file of ADOPTERS) {
  const source = readFileSync(join(SRC, 'pages', file), 'utf8');
  assert.match(source, /SbStateComponent/, `${file} must use the shared state component`);
}

// The reports template is separate from its component file.
const reportsTemplate = readFileSync(join(SRC, 'pages', 'reports.component.html'), 'utf8');
assert.match(reportsTemplate, /<sb-state/, 'reports template must use the shared state component');

// Permission awareness: an empty state must be able to render with no action
// at all, so it never advertises a button the reader cannot press.
const backlog = readFileSync(join(SRC, 'pages', 'backlog.component.ts'), 'utf8');
assert.match(
  backlog,
  /\[actionLabel\]="auth\.isAdmin\(\) \? '[^']+' : ''"/,
  'backlog empty state must hide its action from non-admins',
);

// Filtered-out lists must offer a way back, otherwise the reader is stuck.
assert.match(backlog, /variant="no-results"[\s\S]*?\(action\)="clearFilters\(\)"/, 'backlog no-results must offer clear filters');

console.log(
  `shared states OK (${VARIANTS.length} variants, a11y roles, message fallbacks, `
  + `${ADOPTERS.length + 1} adopting screens)`,
);
