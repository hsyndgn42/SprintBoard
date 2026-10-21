// Regression coverage for the shared design-token layer.
//
// The UI relies on a single semantic token set (--sb-*) and on the legacy
// --oc-* names remaining valid aliases. Dropping either breaks styling
// silently, so assert both here. Dependency-free, matching the other
// scripts/test-*.cjs harnesses.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const css = readFileSync(join(__dirname, '..', 'frontend', 'src', 'sb-foundation.css'), 'utf8');

const REQUIRED_TOKENS = [
  '--sb-primary', '--sb-bg', '--sb-surface', '--sb-border',
  '--sb-text', '--sb-text-secondary', '--sb-text-muted',
  '--sb-success', '--sb-warning', '--sb-danger', '--sb-info',
  '--sb-space-1', '--sb-space-4', '--sb-radius-md', '--sb-radius-pill',
  '--sb-shadow-sm', '--sb-focus-ring-color', '--sb-duration-base',
  '--sb-z-modal', '--sb-z-toast',
];

for (const token of REQUIRED_TOKENS) {
  assert.match(css, new RegExp(`${token}\\s*:`), `missing design token ${token}`);
}

// Legacy names must stay defined so existing rules keep resolving.
const LEGACY_ALIASES = [
  '--oc-bg', '--oc-surface', '--oc-border', '--oc-text', '--oc-muted',
  '--oc-primary', '--oc-radius', '--oc-font-family',
  '--oc-space-1', '--oc-space-2', '--oc-space-3',
  '--oc-space-4', '--oc-space-5', '--oc-space-6',
  '--navy', '--green', '--amber', '--red', '--shadow',
];

for (const alias of LEGACY_ALIASES) {
  assert.match(css, new RegExp(`${alias}\\s*:\\s*var\\(--sb-`), `legacy alias ${alias} must map to a --sb-* token`);
}

// Reduced-motion must stay honoured.
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/, 'reduced-motion block missing');

console.log(`design tokens OK (${REQUIRED_TOKENS.length} tokens, ${LEGACY_ALIASES.length} aliases)`);
