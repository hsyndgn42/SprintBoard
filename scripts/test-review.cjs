// Pure aggregation checks; no browser, database or Angular runtime required.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('../frontend/node_modules/typescript');
require.extensions['.ts'] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  module._compile(output.outputText, filename);
};
const { buildReview, effort } = require('../frontend/src/app/pages/review.model.ts');
const settings = { estimationMode: 'SIZE_AND_HOURS', hoursPerDay: 8 };
const task = (id, fields = {}) => ({ id, name: id, taskCategory: 'DEV', taskSubtype: null, workKind: 'DEV', status: 'done', estimatedHours: 16, size: 'MEDIUM', storyPoints: null, assignments: [], ...fields });
const items = [
  task('done', { assignments: [{ memberName: 'A', estimatedHours: 8 }, { memberName: 'B', estimatedHours: 8 }] }),
  task('undone', { status: 'undone', size: 'SMALL', estimatedHours: 8 }),
  task('doing', { status: 'doing', taskCategory: 'TEST', taskSubtype: 'E2E_TEST', size: null, estimatedHours: 4 }),
  task('todo', { status: 'todo', taskCategory: 'DEFECT', taskSubtype: 'PROD_DEFECT', estimatedHours: 0 }),
  task('meeting', { taskCategory: 'BAU', taskSubtype: 'MEETING', estimatedHours: 32 }),
  task('leave', { taskCategory: 'BAU', taskSubtype: 'LEAVE', estimatedHours: 999, assignments: [{ leaveDays: 2 }, { leaveDays: 1 }] }),
  task('support', { taskCategory: 'BAU', taskSubtype: 'SUPPORT', estimatedHours: 0, assignments: [{ supportOnly: true, estimatedHours: 0 }] }),
];
const result = buildReview({ items }, settings);
assert.equal(result.delivery.length, 4, 'BAU excluded; multi-assignment counted once');
assert.equal(result.rate, 25);
assert.equal(result.pending.length, 3);
assert.equal(result.deliveryHours, 28);
assert.equal(result.bauHours, 32, 'Leave excluded even if erroneous effort exists');
assert.equal(result.leaveHours, 24);
assert.equal(effort(items[5]), 0);
assert.deepEqual(result.statuses.map(row => row.count), [1, 1, 1, 1]);
assert.deepEqual(result.statuses.map(row => row.hours), [16, 8, 4, 0]);
assert.equal(result.sizes.reduce((sum, row) => sum + row.count, 0), 3);
assert.equal(result.missingSize, 1);
assert.equal(result.missingPoints, 4);
assert.equal(result.breakdowns.find(group => group.category === 'TEST').rows.find(row => row.key === 'E2E_TEST').count, 1);
assert.equal(result.breakdowns.find(group => group.category === 'DEFECT').rows.find(row => row.key === 'PROD_DEFECT').count, 1);
const points = buildReview({ items: [task('a', { storyPoints: 5 }), task('b', { storyPoints: 3, status: 'undone' }), task('c'), task('bau', { taskCategory: 'BAU', storyPoints: 99 })] }, { ...settings, estimationMode: 'POINTS_AND_HOURS' });
assert.equal(points.points, 8);
assert.equal(points.donePoints, 5);
assert.equal(points.missingPoints, 1);
const empty = buildReview({ items: [] }, settings);
assert.equal(empty.rate, null);
assert.equal(empty.deliveryHours, 0);
assert.equal(empty.pending.length, 0);
assert.equal(buildReview({ items: [items[5]] }, { ...settings, hoursPerDay: 6 }).leaveHours, 18);
assert.equal(buildReview({ items: [items[4]] }, settings).rate, null, 'BAU-only sprint must not imply delivery');
assert.equal(buildReview({ items: [task('legacy', { taskCategory: 'TEST', taskSubtype: null })] }, settings).breakdowns[1].rows.at(-1).count, 1);
console.log('Review aggregation: 25 assertions passed (outcomes, taxonomy, size/SP, BAU, leave, multi-assignment, empty data).');
const taxonomy = require('../frontend/src/app/task-taxonomy.ts');
taxonomy.TASK_SUBTYPES.DEV=[{value:'CUSTOM_dev',label:'Integration',active:false}];
taxonomy.TASK_SUBTYPES.TEST.push({value:'CUSTOM_test',label:'Security Test',active:true});
const custom=buildReview({items:[task('custom-dev',{taskSubtype:'CUSTOM_dev'}),task('custom-test',{taskCategory:'TEST',taskSubtype:'CUSTOM_test'})]},settings);
assert.equal(custom.breakdowns.find(g=>g.category==='DEV').rows.find(r=>r.key==='CUSTOM_dev').count,1);
assert.equal(custom.breakdowns.find(g=>g.category==='TEST').rows.find(r=>r.key==='CUSTOM_test').label,'Security Test');
assert.equal(taxonomy.availableSubtypes('DEV').length,0);
assert.equal(taxonomy.availableSubtypes('DEV','CUSTOM_dev')[0].label,'Integration (pasif)');
assert.equal(taxonomy.taskSubtypeLabel('CUSTOM_dev'),'Integration');
console.log('Custom taxonomy: dynamic Review grouping, historical labels, inactive selection and existing edit: OK');

const mixedBau=['todo','doing','undone','done'].map((status,i)=>task('bau-'+i,{taskCategory:'BAU',taskSubtype:['MEETING','TRAINING','LEAVE','SUPPORT'][i],status,estimatedHours:8}));
const original=JSON.stringify(mixedBau);
for(const sprintStatus of ['active','completed']){
 const r=buildReview({items:[...items.slice(0,4),...mixedBau],status:sprintStatus,closureFrozen:sprintStatus==='completed'},settings);
 assert.equal(r.rate,25,'BAU does not inflate delivery');
 assert.equal(r.bau.length,4);
 assert.ok(r.bau.every(t=>t.status==='done'));
 assert.equal(r.categories.find(g=>g.key==='BAU').done,4);
 assert.deepEqual(r.categories.find(g=>g.key==='BAU').statuses.map(s=>s.count),[4,0,0,0]);
 assert.ok(r.breakdowns.find(g=>g.category==='BAU').rows.every(row=>row.done===row.count));
 assert.equal(r.items.filter(t=>t.status==='done').length,5,'Detailed filter uses same derived status');
}
assert.equal(JSON.stringify(mixedBau),original,'Live and frozen sources stay unchanged');
const {editorialSprintHtml}=require('../frontend/src/app/pages/presentation-html.ts');
const html=editorialSprintHtml({id:'qa',name:'QA',number:1,start:'2026-10-06',end:'2026-10-26',status:'active',items:mixedBau},settings,'2026-10-16T12:00:00Z',[],null);
assert.ok(html.includes('BAU her zaman otomatik Done'));
assert.ok(!html.includes('<small>Undone'));
console.log('Automatic BAU Review: active/frozen, filters, charts, delivery isolation, source immutability and HTML passed.');
