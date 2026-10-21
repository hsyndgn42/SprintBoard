/**
 * Dashboard decision-support signals (P-02).
 *
 * Locks the contract between the additive overview fields and the way the
 * dashboard presents them: counts stay counts, every denominator is guarded,
 * zero-count signals disappear instead of shouting, and nothing is rendered
 * as a judgement the data cannot support. Dataset-agnostic: the expectations
 * are derived from the source, never from the live database.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const ts = fs.readFileSync(path.join(root, 'frontend/src/app/pages/overview.component.ts'), 'utf8');
const html = fs.readFileSync(path.join(root, 'frontend/src/app/pages/overview.component.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'frontend/src/app/pages/overview.component.css'), 'utf8');
const api = fs.readFileSync(path.join(root, 'frontend/src/app/api.service.ts'), 'utf8');
const java = fs.readFileSync(path.join(root, 'service/src/main/java/com/sprintboard/WorkspaceService.java'), 'utf8');

const failures = [];
function check(label, condition) { if (!condition) failures.push(label); }

// --- contract: the service and the client agree on every field name -------
const SIGNALS = [
  'activeSprintDaysTotal', 'activeSprintDaysRemaining', 'activeSprintBlockedCount',
  'activeSprintAddedDuringCount', 'activeSprintUnestimatedCount',
  'activeSprintUnassignedCount', 'activeSprintTypeBreakdown',
];
for (const field of SIGNALS) {
  check(`service emits ${field}`, java.includes(`"${field}"`));
  check(`client declares ${field}`, api.includes(`${field}?:`));
}

// Optional on the client so an older service or a cached response still
// renders rather than throwing on undefined.
check('signals are optional on the client', SIGNALS.every(f => api.includes(`${f}?:`)));

// --- the dashboard must not invent metrics --------------------------------
check('no invented health score', !/healthScore|health_score|riskScore/i.test(ts + html));

// --- every ratio guards its denominator -----------------------------------
check('delivery progress guards zero tasks', /deliveryTaskCount \? /.test(ts));
check('time elapsed guards zero-length sprint', /total <= 0/.test(ts));
check('time elapsed guards missing day span', /remaining === null \|\| remaining === undefined/.test(ts));
check('time elapsed is clamped to 0..100', /Math\.min\(100, Math\.max\(0,/.test(ts));
check('type share guards empty breakdown', /const total = this\.typeTotal; return total \?/.test(ts));

// --- attention strip ------------------------------------------------------
check('alerts return empty without an active sprint', /if \(!view \|\| !active\) return \[\];/.test(ts));
check('zero-count signals are filtered out', /rows\.filter\(row => row\.count > 0\)/.test(ts));
check('alerts default missing counts to zero', (ts.match(/\?\? 0,/g) || []).length >= 4);
for (const key of ['blocked', 'unestimated', 'unassigned', 'added']) {
  check(`alert present: ${key}`, ts.includes(`key: '${key}'`));
}
// Every alert must land on the board *and* name the filter that isolates
// the tasks it counted. A link to an unfiltered board leaves the user
// hunting for which items the number meant, which is how this strip
// previously misled a reader into opening an unrelated task.
check('each alert links to the board', (ts.match(/link: board,/g) || []).length === 4);
check('each alert carries a board focus filter',
  ['blocked', 'unestimated', 'unassigned', 'emergency']
    .every(f => new RegExp(`focus: '${f}'`).test(ts)));
check('alert links pass the focus to the board', /\[queryParams\]="\{focus: alert\.focus\}"/.test(html));
check('clean sprint renders a positive clear state', /attention-clear/.test(html));
check('attention strip hidden when the service sent no signals', /@if \(hasSignals\)/.test(html));
check('hasSignals probes for undefined, not falsy zero', /!== undefined/.test(ts));

// --- units and scope are always stated ------------------------------------
check('attention strip states its unit', /İŞ ADEDİ/.test(html));
check('attention strip states BAU exclusion', /BAU ve izin kayıtları hariçtir/.test(html));
// The footnote is the only place the reserve rule is explained to the
// reader; if the backend rule changes, this sentence must change with it.
check('attention strip states the reserve exclusion', /Defect Support rezervinden karşılanmayan/.test(html));
check('distribution states task-count unit', /TESLİMAT İŞİ/.test(html));
check('schedule bar states it is calendar days', /Takvim günü/.test(html));
check('schedule bar does not claim leave is deducted', /düşülmez/.test(html));

// --- accessibility --------------------------------------------------------
check('schedule bar exposes progressbar semantics', /role="progressbar" aria-label="Geçen sprint süresi oranı"/.test(html));
check('schedule bar publishes its value', /\[attr\.aria-valuenow\]="timeElapsed"/.test(html));
check('distribution bar has a text alternative', /role="img" aria-label="Aktif sprint iş tipi dağılımı"/.test(html));
check('decorative arrows are hidden from assistive tech', /<i aria-hidden="true">→<\/i>/.test(html));
check('attention strip is a labelled region', /aria-label="Dikkat gerektiren işler"/.test(html));
check('legend repeats values as text', /\{\{ row\.taskCount \}\} iş · \{\{ row\.doneCount \}\} Done/.test(html));

// --- no hard-coded team identity ------------------------------------------
check('heading uses the configured team name', /\{\{ teamName\(\) \}\}/.test(html));
check('no hard-coded team name remains', !/VIBE Craft/.test(html));

// --- shared design language -----------------------------------------------
check('distribution reuses the shared bar primitive', /class="sb-bar"/.test(html) && /class="sb-bar__seg"/.test(html));
check('distribution reuses the shared legend primitive', /class="sb-legend"/.test(html));
check('new styles use design tokens', /var\(--sb-warning\)/.test(css) && /var\(--sb-info\)/.test(css));
check('no new !important', !/!important/.test(css));
check('attention strip collapses on narrow screens', /@media \(max-width:640px\)\{\.attention-list\{grid-template-columns:1fr\}/.test(css));

// --- the page still degrades safely ---------------------------------------
check('loading state retained', /variant="loading"/.test(html));
check('error state retained with retry', /variant="error"/.test(html) && /\(action\)="load\(\)"/.test(html));
check('no-active-sprint branch retained', /Aktif sprint yok/.test(html));

if (failures.length) {
  console.error('dashboard signals FAILED:\n - ' + failures.join('\n - '));
  process.exit(1);
}
console.log(`dashboard signals OK (${SIGNALS.length} signals, attention strip, scope distribution, schedule context)`);
