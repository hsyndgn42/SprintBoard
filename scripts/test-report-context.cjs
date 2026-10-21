// P-13: a report is only trustworthy if the reader can see what it covers.
// These assertions lock the context strip to the active tab, so a new tab
// cannot silently inherit another tab's scope line.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'frontend/src/app/pages/reports.component.html'), 'utf8');
const ts = fs.readFileSync(path.join(root, 'frontend/src/app/pages/insights.component.ts'), 'utf8');

let failed = [];
const check = (name, ok) => { if (!ok) failed.push(name); };

check('the context strip exists', /class="sb-context report-context"/.test(html));
check('the strip is labelled for assistive tech', /aria-label="Rapor kapsam/.test(html));

// The four questions a reader asks before trusting a number.
for (const term of ['Rapor', 'Kapsam', 'Veri zamanı', 'Kesinlik']) {
  check('the strip states ' + term, new RegExp('<dt>' + term + '</dt>').test(html));
}

check('the report name is bound, not hard-coded', /\{\{ activeTabLabel \}\}/.test(html));
check('the scope is bound, not hard-coded', /\{\{ activeScope \}\}/.test(html));
check('data freshness is shown on screen, not only in print', /\{\{ viewTime \}\}/.test(html));

// The strip must sit above the panels so it is read before the figures.
check('the strip precedes the report panels',
  html.indexOf('sb-context report-context') < html.indexOf('report-tab-panel'));

check('the scope resolves per tab', /switch\s*\(this\.activeTab\)/.test(ts));
check('scope falls back for tabs that filter themselves',
  /default: return 'Bölüm kendi filtre kapsamını kullanır'/.test(ts));
check('the delivery scope reports how many sprints it covers',
  /Tüm tamamlanan sprintler \(' \+ this\.rows\.length/.test(ts));
check('the member scope reuses the existing export scope string',
  /case 'members': return this\.memberScope;/.test(ts));
check('the type scope reuses the existing period string',
  /case 'types': return this\.typePeriod;/.test(ts));

// Freshness must be a real timestamp, not a static label.
check('the view time is generated at load', /viewTime=new Intl\.DateTimeFormat/.test(ts));

if (failed.length) {
  console.log('report context FAILED:\n - ' + failed.join('\n - '));
  process.exit(1);
}
console.log('report context OK (4 context fields, per-tab scope, on-screen freshness)');
