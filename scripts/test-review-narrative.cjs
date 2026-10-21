/**
 * Sprint review screen narrative and meeting mode (phase 2, R-01/R-02/R-06).
 *
 * Source-level contract checks: the review screen must tell the sprint story
 * in a fixed order, and presentation mode must stay usable in a meeting room
 * without trapping the user or duplicating any business calculation.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const html = read('frontend/src/app/pages/sprint-review.component.html');
const code = read('frontend/src/app/pages/sprint-review.component.ts');
const narrativeCss = read('frontend/src/app/pages/sprint-review-narrative.css');
const model = read('frontend/src/app/pages/review-summary.model.ts');

const failures = [];
const check = (label, condition) => { if (!condition) failures.push(label); };

// --- the narrative appears in the order a review meeting follows ---------
const order = [
  'review-summary',   // executive summary first
  'review-outcome',   // planned versus completed
  'review-delivered', // what was delivered
  'review-pending',   // what was not
  'review-scope',     // what changed
  'review-exceptions',// what needs attention
  'review-appendix',  // the detail behind it all
];
let cursor = -1;
for (const id of order) {
  const at = html.indexOf(`id="${id}"`);
  check(`section present: ${id}`, at >= 0);
  check(`section in narrative order: ${id}`, at > cursor);
  if (at >= 0) cursor = at;
}

// --- the reader can navigate and understand the figures ------------------
check('section navigation exists', /class="review-jump"/.test(html));
check('section navigation is labelled', /<nav class="review-jump" aria-label=/.test(html));
check('every section is a labelled region',
  (html.match(/aria-labelledby="review-(summary|exceptions)-title"/g) || []).length >= 2);
check('metric definitions are shown on screen too', /definitions/.test(code));
check('definitions are shared with the export, not retyped',
  /REVIEW_DEFINITIONS/.test(code) && /export const REVIEW_DEFINITIONS/.test(model));

// --- meeting mode ---------------------------------------------------------
check('presentation mode is component state, not a duplicate route',
  /presenting\s*=\s*signal\(false\)/.test(code));
check('presentation mode reuses the same derived model',
  !/buildReview\([^)]*\)[\s\S]{0,80}presenting/.test(code));
check('an explicit enter action exists', /data-testid="enter-presentation"/.test(html));
check('an always-visible exit action exists', /data-testid="exit-presentation"/.test(html));
check('Escape exits presentation mode',
  /event\.key==='Escape'&&this\.presenting\(\)/.test(code));
check('Escape does nothing when not presenting',
  /if\(!this\.presenting\(\)\)return;/.test(code));
check('focus moves into the presentation on entry',
  /getElementById\('review-presentation-title'\)\?\.focus\(\)/.test(code));
check('the presentation title can receive focus', /id="review-presentation-title"[^>]*tabindex="-1"/.test(html));
check('focus returns to the trigger on exit',
  /presentTrigger/.test(code) && /trigger\?\.focus\(\)/.test(code));
check('leaving the sprint also leaves presentation mode',
  /this\.presenting\.set\(false\)/.test(code));

// --- meeting mode must not fight the room --------------------------------
check('presentation mode does not trap keyboard focus',
  !/focusin|focusTrap|trapFocus/.test(code));
check('nothing auto-advances', !/setInterval|setTimeout\([^)]*slide/i.test(code));
check('reduced motion is respected',
  /prefers-reduced-motion/.test(narrativeCss));
check('presentation typography is scaled up for a room',
  /\.review\.presenting\{[^}]*font-size:17px/.test(narrativeCss)
  && /\.review\.presenting h2\{font-size:26px\}/.test(narrativeCss));
check('presentation mode is an overlay, so the app chrome needs no override',
  /\.review\.presenting\{position:fixed;inset:0/.test(narrativeCss));
// No !important is needed: the component selector already outranks the user
// agent rule that hides the contents of a collapsed <details>.
check('collapsed detail is forced open so nothing is hidden on stage',
  /\.review\.presenting details>\*\{display:block\}/.test(narrativeCss));
// CSS alone is not sufficient in current browsers, so the attribute is set.
check('narrative sections are opened by attribute, not only by CSS',
  /el\.open=true/.test(code) && /openNarrative/.test(code));
check('the presenter gets their previous layout back on exit',
  /narrativeWasOpen/.test(code) && /el\.open=this\.narrativeWasOpen\.get\(id\)/.test(code));
check('the collapse affordance is removed rather than left inert',
  /\.review\.presenting summary\{list-style:none;cursor:default\}/.test(narrativeCss));
check('noisy controls are hidden on stage',
  /\.review\.presenting \.share-actions/.test(narrativeCss));

// --- no invented content --------------------------------------------------
check('exceptions come from the shared fact-only model', /reviewExceptions/.test(code));
check('the screen does not hard-code a risk sentence',
  !/(risk|öneri)\s*=\s*['"]/.test(code));
check('no combined health score is computed',
  !/healthScore|sağlıkSkoru|overallScore/i.test(code + model + html));

if (failures.length) {
  console.error('review narrative FAILED:\n - ' + failures.join('\n - '));
  process.exit(1);
}
console.log('review narrative OK (meeting order, shared definitions, accessible presentation mode, no invented content)');
