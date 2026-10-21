// P-16: accessibility guarantees that are cheap to break silently.
// Each assertion here failed-or-could-fail for a real reason, so none of
// them is decorative.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let failed = [];
const check = (name, ok) => { if (!ok) failed.push(name); };

// --- generated HTML tables -------------------------------------------------
// Both exports funnel every table through one helper, so the header
// association is either right everywhere or wrong everywhere.
for (const file of ['frontend/src/app/pages/presentation-html.ts',
                    'frontend/src/app/pages/report-tab-html.ts']) {
  const src = read(file);
  const name = path.basename(file);
  check(name + ' associates headers with their column',
    /<th scope="col">/.test(src));
  check(name + ' leaves no unscoped header behind',
    (src.match(/<th(?=[ >])(?! scope=)/g) || []).length === 0);
  // A screen reader reaching an empty table should hear why, not silence.
  check(name + ' explains an empty result set in the table body',
    /colspan="\$\{headers\.length\}"/.test(src));
}

// --- icon-only controls ----------------------------------------------------
// A button whose entire content is an icon or glyph has no accessible name
// unless one is supplied explicitly.
const templates = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) walk(f);
    else if (/\.html$/.test(e.name)) templates.push(f);
  }
})(path.join(root, 'frontend/src/app'));

const unnamed = [];
for (const f of templates) {
  const src = fs.readFileSync(f, 'utf8');
  const re = /<button\b[^>]*>([\s\S]*?)<\/button>/g;
  let m;
  while ((m = re.exec(src))) {
    const attrs = m[0].slice(0, m[0].indexOf('>'));
    const text = m[1].replace(/<[^>]*>/g, '').trim();
    const named = /aria-label|aria-labelledby/.test(attrs);
    // Interpolation counts as a name; pure punctuation or glyphs do not.
    const symbolic = !text || /^[^\p{L}\p{N}{]+$/u.test(text);
    if (!named && symbolic) unnamed.push(path.relative(root, f) + ' :: ' + text);
  }
}
check('every icon-only button has an accessible name (' + unnamed.length + ' without)',
  unnamed.length === 0);

// --- status announcements --------------------------------------------------
check('toasts are announced without stealing focus', /aria-live/.test(read('frontend/src/app/shared/sb-toast.ts')));

const state = read('frontend/src/app/shared/sb-state.component.ts');
check('the shared state block announces itself', /aria-live|role=/.test(state));

// The unsaved badge is a status, not an alert: it must not interrupt typing.
check('the unsaved badge is polite, not assertive',
  /role="status"/.test(read('frontend/src/app/pages/work-settings.component.ts')));

// --- navigation landmarks --------------------------------------------------
const settings = read('frontend/src/app/pages/insights.component.ts');
check('the settings category nav is a labelled landmark',
  /<nav class="settings-nav" aria-label="Ayar kategorileri">/.test(settings));
// Jump targets must receive focus, or keyboard users scroll without moving.
check('jumping moves focus, not just scroll position', /\.focus\(\)/.test(settings));

check('the report context strip is labelled',
  /aria-label="Rapor kapsam/.test(read('frontend/src/app/pages/reports.component.html')));

if (failed.length) {
  console.log('accessibility FAILED:\n - ' + failed.join('\n - '));
  if (unnamed.length) console.log('\nunnamed buttons:\n - ' + unnamed.join('\n - '));
  process.exit(1);
}
console.log('accessibility OK (scoped export headers, named icon buttons, polite status, labelled landmarks)');
