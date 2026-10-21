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

// --- second iteration: professional platform scales -----------------------
// Typography, data-visualisation, print and density scales are what keep
// dashboards, reports and printed output looking like one product. Losing
// one of them regresses silently into per-page hard-coded values again.
const SCALE_TOKENS = [
  '--sb-font-2xl', '--sb-font-3xl', '--sb-font-display',
  '--sb-leading-tight', '--sb-leading-normal',
  '--sb-weight-medium', '--sb-weight-semibold', '--sb-weight-bold',
  '--sb-tracking-eyebrow',
  '--sb-space-9', '--sb-space-10',
  '--sb-print-ink', '--sb-print-muted', '--sb-print-line',
  '--sb-control-h', '--sb-row-pad-y',
  '--sb-dialog-sm', '--sb-dialog-md', '--sb-dialog-lg',
];

for (const token of SCALE_TOKENS) {
  assert.match(css, new RegExp(`${token}\\s*:`), `missing scale token ${token}`);
}

// The categorical ramp must stay complete: the distribution bar and legend
// cycle through all eight slots, so a gap would silently repeat a colour.
for (let i = 1; i <= 8; i += 1) {
  assert.match(css, new RegExp(`--sb-viz-${i}\\s*:\\s*#`), `missing data-visualisation token --sb-viz-${i}`);
}
assert.match(css, /--sb-viz-track\s*:/, 'missing --sb-viz-track');

// Shared primitives must exist, otherwise pages fall back to bespoke markup.
const REQUIRED_PRIMITIVES = [
  '.sb-metrics', '.sb-metric__label', '.sb-metric__value', '.sb-metric__unit',
  '.sb-bar__seg', '.sb-legend__swatch', '.sb-context', '.sb-definitions',
  '.sb-skeleton',
];

for (const primitive of REQUIRED_PRIMITIVES) {
  assert.ok(css.includes(primitive), `missing shared primitive ${primitive}`);
}

// The skeleton animates, so reduced-motion coverage has to be global rather
// than opt-in per component.
assert.match(css, /animation-duration:\s*\.01ms\s*!important/, 'reduced-motion must neutralise animations globally');

console.log(
  `design tokens OK (${REQUIRED_TOKENS.length} tokens, ${LEGACY_ALIASES.length} aliases, `
  + `${SCALE_TOKENS.length} scale tokens, 8 viz colours, ${REQUIRED_PRIMITIVES.length} primitives)`,
);
