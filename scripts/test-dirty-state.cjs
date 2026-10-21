/**
 * Unsaved-change protection (P-06).
 *
 * The rules in section 11 are mostly about when NOT to warn, so most of
 * these assertions check that the mechanism stays quiet: no warning
 * without a real change, none while a save is in flight, none on a
 * read-only page. Dataset-agnostic: read from source.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const lib = read('frontend/src/app/shared/dirty-state.ts');
const routes = read('frontend/src/app/app.routes.ts');
const form = read('frontend/src/app/pages/work-settings.component.ts');
const css = read('frontend/src/sb-foundation.css');

const failures = [];
const check = (label, condition) => { if (!condition) failures.push(label); };

// --- a single shared mechanism, not per-page hacks ------------------------
check('a shared service exists', /@Injectable\(\{ providedIn: 'root' \}\)\s*export class DirtyStateService/.test(lib));
check('a shared comparison helper exists', /export class DirtyTracker/.test(lib));
check('a shared route guard exists', /export const unsavedChangesGuard: CanDeactivateFn/.test(lib));

// --- only warn on a real change -------------------------------------------
check('dirtiness is a value comparison, not a touched flag',
  /snapshot\(current\) !== this\.baseline/.test(lib));
check('comparison is key-order independent', /Object\.keys\(source\)\.sort\(\)/.test(lib));
check('blank, null and undefined are treated alike',
  /value === null \|\| value === undefined \|\| value === ''/.test(lib));
check('typing and undoing leaves no warning', /reset\(value: unknown\): void \{ this\.baseline = snapshot\(value\); \}/.test(lib));

// --- never warn while saving, and never trap after a failed save ----------
check('a save in flight suppresses the warning', /if \(this\.busy\) return false;/.test(lib));
check('the form marks the save start', /this\.tracker\.saving\(true\)/.test(form));
check('the flag is cleared in finally, so a failed save releases the user',
  /finally\{this\.saving=false;this\.tracker\.saving\(false\)/.test(form));
check('a successful save re-baselines the form',
  /this\.tracker\.reset\(this\.formValue\(\)\)/.test(form));

// --- never warn on a read-only page ---------------------------------------
check('the browser guard attaches only when a source is registered',
  /const needed = this\.sources\.size > 0;/.test(lib));
check('the browser guard detaches again', /removeEventListener\('beforeunload'/.test(lib));
check('beforeunload checks dirtiness before blocking', /if \(!this\.isDirty\(\)\) return;/.test(lib));
check('nothing is dirty when no source is registered', /return \[\.\.\.this\.sources\.values\(\)\]\.some/.test(lib));

// --- registrations are released -------------------------------------------
check('components can release their registration', /release\(token: object\)/.test(lib));
check('the adopting form releases on destroy', /ngOnDestroy\(\)\{this\.dirtyState\.release\(this\);\}/.test(form));
check('the adopting form implements OnDestroy', /implements OnInit,OnDestroy/.test(form));

// --- in-app navigation gets the same protection ---------------------------
check('the guard is wired to the settings route',
  /path: 'settings',[^}]*canDeactivate: \[unsavedChangesGuard\]/.test(routes));
check('read-only routes are left unguarded',
  routes.split('\n').filter(l => /canDeactivate/.test(l)).length === 1);

check('the guard is imported', /import \{ unsavedChangesGuard \} from '\.\/shared\/dirty-state'/.test(routes));
check('read-only routes are not guarded',
  !/path: 'reports'[^}]*canDeactivate/.test(routes) && !/path: 'overview'[^}]*canDeactivate/.test(routes));

// --- the user can tell what state they are in -----------------------------
check('unsaved state is visible, not only on exit', /@if\(dirty\(\)\)\{<span class="dirty-hint"/.test(form));
check('saving is distinguished from unsaved in the button label',
  /\{\{saving\?'Kaydediliyor…':'Çalışma düzenini kaydet'\}\}/.test(form));
check('Cancel stays available', /type="button" \[disabled\]="saving" \(click\)="reset\(\)">Vazgeç/.test(form));
check('the indicator is announced', /role="status"/.test(form));
check('the indicator is styled from warning tokens', /\.dirty-hint\{[^}]*var\(--sb-warning-fg\)/.test(css));

// --- the confirmation itself ----------------------------------------------
check('confirmation names what would be lost', /dirtyLabels\(\)/.test(lib));
check('confirmation is skipped when nothing is dirty', /if \(!labels\.length\) return true;/.test(lib));
check('confirmation explains the consequence', /değişiklikler kaybolur/.test(lib));
check('the native dialog is used so it is keyboard accessible', /return confirm\(/.test(lib));

// --- the guard must not change what gets submitted ------------------------
check('the tracker never touches the payload',
  !/payload|body|api\.(put|post)/.test(lib));

// --- behavioural check: compile the tracker and exercise it ---------------
// Source assertions prove the code says the right thing; this proves it
// does the right thing, including the undo case the Angular dirty flag
// gets wrong.
(() => {
  const esbuild = require(path.join(root, 'frontend/node_modules/esbuild'));
  const built = esbuild.buildSync({
    entryPoints: [path.join(root, 'frontend/src/app/shared/dirty-state.ts')],
    bundle: true, format: 'cjs', write: false, platform: 'node', logLevel: 'silent',
    external: ['@angular/core', '@angular/router'],
  }).outputFiles[0].text;

  // The Angular imports are only needed by the service and the guard; the
  // tracker is plain TypeScript, so they are stubbed out.
  const Module = require('module');
  const load = Module._load;
  Module._load = function (request, ...rest) {
    if (request.startsWith('@angular/')) return { Injectable: () => () => undefined, inject: () => undefined };
    return load.call(this, request, ...rest);
  };
  const sandbox = { module: { exports: {} }, exports: {}, require };
  new Function('module', 'exports', 'require', built)(sandbox.module, sandbox.module.exports, require);
  Module._load = load;
  const { DirtyTracker } = sandbox.module.exports;

  const form = { name: 'Team', hours: 8, days: [1, 2, 3] };
  const tracker = new DirtyTracker(form);
  check('clean form is not dirty', tracker.isDirty(form) === false);
  check('a changed value is dirty', tracker.isDirty({ ...form, name: 'Team X' }) === true);
  check('undoing a change clears the warning', tracker.isDirty({ ...form, name: 'Team' }) === false);
  check('key order does not matter', tracker.isDirty({ days: [1, 2, 3], hours: 8, name: 'Team' }) === false);
  check('empty string and null are the same absence',
    new DirtyTracker({ note: '' }).isDirty({ note: null }) === false);
  check('a real edit after a baseline reset is detected', (() => {
    const t2 = new DirtyTracker({ a: 1 });
    t2.reset({ a: 2 });
    return t2.isDirty({ a: 2 }) === false && t2.isDirty({ a: 3 }) === true;
  })());
  check('a save in flight silences the warning', (() => {
    const t3 = new DirtyTracker(form);
    t3.saving(true);
    const quiet = t3.isDirty({ ...form, name: 'changed' }) === false;
    t3.saving(false);
    // A failed save must hand control back, not trap the user.
    return quiet && t3.isDirty({ ...form, name: 'changed' }) === true;
  })());
  check('nested values are compared, not identity',
    tracker.isDirty({ ...form, days: [1, 2, 4] }) === true);
})();

if (failures.length) {
  console.error('dirty state FAILED:\n - ' + failures.join('\n - '));
  process.exit(1);
}
console.log('dirty state OK (shared service, tracker and route guard; quiet when clean, saving or read-only)');
