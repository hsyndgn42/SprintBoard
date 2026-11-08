// Exercise production chart getters with synthetic data, without Angular or a browser.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../frontend/node_modules/typescript');
const page = path.join(__dirname, '../frontend/src/app/pages');
const core = {Component: () => value => value, Input: () => () => {}, Output: () => () => {},
  inject: () => ({}), EventEmitter: class {emit() {}}};
function load(file, imports = {}) {
  const context = {exports: {}, Intl, require: name => name === '@angular/core' ? core : (imports[name] || {})};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(page, file), 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true}
  }).outputText, context);
  return context.exports;
}
const charts = load('report-charts.ts');
const stack = new charts.SbStackComponent();
const empty = {segments: []};
assert.equal(stack.total(empty), 0);
assert.equal(stack.total({segments: [{value: 0}]}), 0);
assert.equal(stack.pct(empty, {value: 0}), 0);
const fractional = {segments: [{value: 0.25}, {value: 0.5}]};
assert.equal(stack.total(fractional), 0.75);
assert.equal(stack.pct(fractional, fractional.segments[0]), 33);
assert.equal(stack.pct(fractional, fractional.segments[1]), 67);
const donut = new charts.SbDonutComponent();
donut.slices = [{label: 'A', value: 0.25}, {label: 'B', value: 0.5}];
assert.equal(donut.total, 0.75);
assert.equal(donut.arcs.reduce((n, a) => n + a.pct, 0), 100);
donut.slices = [{label: 'A', value: 0.5}];
assert.equal(donut.arcs[0].pct, 100);
donut.slices = [];
assert.equal(donut.arcs.length, 0);
const {RoadmapReportComponent} = load('roadmap-report.component.ts', {'./report-charts': charts});
const roadmap = new RoadmapReportComponent();
roadmap.rows = Array.from({length: 12}, (_, i) => ({id: String(i), title: 'Proje ' + i, kind: 'PROJECT',
  assignedHours: i + 1, overtimeHours: i / 4, doneHours: 0}));
const original = JSON.stringify(roadmap.rows);
assert.equal(roadmap.overtimeSlices.length, 8);
assert.match(roadmap.overtimeSlices[7].label, /Diğer 4 öğe/);
assert.equal(roadmap.overtimeSlices.reduce((n, s) => n + s.value, 0), roadmap.total('overtimeHours'));
assert.equal(roadmap.effortSlices.reduce((n, s) => n + s.value, 0), roadmap.total('assignedHours'));
roadmap.query = 'Proje 11';
assert.equal(roadmap.overtimeSlices.length, 1);
assert.equal(roadmap.overtimeSlices[0].value, 2.75);
assert.equal(JSON.stringify(roadmap.rows), original);
const {CapacityTrendComponent} = load('capacity-trend.component.ts', {'./report-charts': charts});
const capacity = new CapacityTrendComponent();
capacity.rows = [{id: 's1', name: 'Sprint 1', people: 2, known: 1, unknown: 0,
  corePlanned: 80, supportPlanned: 40, capacity: 80}];
assert.equal(capacity.coreBars[0].value, 80); // External support cannot inflate the core plan.
assert.equal(capacity.coreBars[0].target, 80);
capacity.rows[0].unknown = 1;
assert.equal(capacity.coreBars[0].target, null); // Partial capacity is not a complete target.
capacity.rows[0].unknown = 0;
capacity.rows[0].capacity = 0;
assert.equal(capacity.coreBars[0].target, 0); // Known zero is not missing data.
console.log('Report charts PASS: zero and fractional totals, full Roadmap aggregation, filters, immutable inputs and core-only capacity.');
