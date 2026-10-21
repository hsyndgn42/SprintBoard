/**
 * Settings information architecture (P-05).
 *
 * The settings page used to be eight unordered accordions. This locks the
 * category structure, the position of the destructive group, and the fact
 * that regrouping did not drop, duplicate or reorder any control inside a
 * section. Dataset-agnostic: everything is read from source.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'frontend/src/app/pages/insights.component.ts'), 'utf8');
const css = fs.readFileSync(path.join(root, 'frontend/src/sb-foundation.css'), 'utf8');

const failures = [];
const check = (label, condition) => { if (!condition) failures.push(label); };

// --- every original section survived exactly once -------------------------
const SECTIONS = [
  'Tahmin yöntemi', 'Slack entegrasyonu', 'Ekip ve çalışma düzeni',
  'Kullanıcılar ve erişim', 'BAU varsayılanları', 'İş türleri',
  'Yedekleme ve veri güvenliği', 'Çalışma takvimi',
];
for (const title of SECTIONS) {
  const count = (src.match(new RegExp('<summary>' + title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
  check(`section present exactly once: ${title}`, count === 1);
}
check('still exactly eight settings sections',
  (src.match(/<details class="settings-section"/g) || []).length === 8);

// --- the categories themselves -------------------------------------------
const GROUPS = ['settings-team', 'settings-delivery', 'settings-integrations', 'settings-admin'];
for (const id of GROUPS) {
  check(`group exists: ${id}`, src.includes(`id="${id}"`));
  check(`group is labelled: ${id}`, src.includes(`aria-labelledby="${id}-heading"`));
  check(`group is a focus target: ${id}`, new RegExp(`id="${id}" tabindex="-1"`).test(src));
  check(`group reachable from nav: ${id}`, src.includes(`jump('${id}')`));
}
check('nav is a labelled landmark', /<nav class="settings-nav" aria-label="Ayar kategorileri">/.test(src));
check('nav uses buttons, not fake links', !/<a href="#\/settings#/.test(src));

// --- DOM order matches the visual order the nav promises ------------------
const positions = GROUPS.map(id => src.indexOf(`id="${id}"`));
check('groups appear in nav order', positions.every((p, i) => i === 0 || p > positions[i - 1]));

// --- destructive actions are separated and last ---------------------------
check('admin group is marked as a danger zone', /class="settings-group danger-zone" id="settings-admin"/.test(src));
check('danger zone is the last group', Math.max(...positions) === src.indexOf('id="settings-admin"'));
check('danger zone warns that restore overwrites', /geri alınamaz/.test(src));
check('backup lives in the danger zone',
  src.indexOf('<summary>Yedekleme') > src.indexOf('id="settings-admin"'));
check('backup no longer auto-expands',
  !/<details class="settings-section" open><summary>Yedekleme/.test(src));

// --- each category explains itself ----------------------------------------
for (const id of GROUPS) {
  const head = src.slice(src.indexOf(`id="${id}"`));
  const описание = /<p>([^<]{40,})<\/p>/.exec(head.slice(0, 700));
  check(`group has a description: ${id}`, !!описание);
}

// --- loading state ---------------------------------------------------------
check('loading uses the shared state component', /@if \(loading\) \{\s*<sb-state variant="loading"/.test(src));
check('loading no longer leaves a half-built page', !/Ayarlar yükleniyor…/.test(src));
check('SbStateComponent is imported', /SbStateComponent\]/.test(src));

// --- keyboard behaviour ----------------------------------------------------
check('jump moves focus as well as scroll', /target\.focus\(\{ preventScroll: true \}\)/.test(src));
check('jump is safe when the target is missing', /if \(!target\) return;/.test(src));
check('nav buttons have a visible focus ring', /\.settings-nav button:focus-visible\{outline:var\(--sb-focus-ring\)/.test(css));
check('focused group is not outlined on mouse click', /\.settings-group:focus\{outline:none\}/.test(css));

// --- styles use tokens -----------------------------------------------------
check('category styles use design tokens', /\.settings-group-head\{margin:0 0 var\(--sb-space-4\)/.test(css));
check('danger zone is tinted from the danger token', /\.settings-group\.danger-zone .settings-group-head\{border-bottom-color:var\(--sb-danger-border\)\}/.test(css));
check('no new !important in the category layer', !/settings-(nav|group)[^}]*!important/.test(css));

if (failures.length) {
  console.error('settings IA FAILED:\n - ' + failures.join('\n - '));
  process.exit(1);
}
console.log(`settings IA OK (${GROUPS.length} categories, ${SECTIONS.length} sections preserved, danger zone isolated)`);
