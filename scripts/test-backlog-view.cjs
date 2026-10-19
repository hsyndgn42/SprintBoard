const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('../frontend/node_modules/typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {BACKLOG_VIEWS,matchesBacklogView}=require('../frontend/src/app/pages/backlog-view.model.ts');
assert.equal(BACKLOG_VIEWS.length,9);assert.equal(new Set(BACKLOG_VIEWS.map(v=>v.value)).size,9);
const rows=[{id:'old',state:'Undone',sprintStatus:'completed'},{id:'pool',state:'Ready',repeatOfId:'old'},
 {id:'active',state:'IN_SPRINT',sprintStatus:'active'},{id:'planned',state:'IN_SPRINT',sprintStatus:'planned'},
 {id:'activeDone',state:'Done',sprintStatus:'active'},{id:'done',state:'Done',sprintStatus:'completed'}];
const ids=view=>rows.filter(r=>matchesBacklogView(r,view)).map(r=>r.id);
assert.deepEqual(ids('open'),['pool','active','planned','activeDone']);assert.deepEqual(ids('Ready'),['pool']);
assert.deepEqual(ids('ACTIVE'),['active','activeDone']);assert.deepEqual(ids('PLANNED'),['planned']);
assert.deepEqual(ids('POOL_ACTIVE'),['pool','active','activeDone']);assert.deepEqual(ids('POOL_PLANNED'),['pool','planned']);
assert.deepEqual(ids('IN_SPRINT'),['active','planned','activeDone']);assert.deepEqual(ids('all'),rows.map(r=>r.id));assert.deepEqual(ids('Done'),['activeDone','done']);
console.log('PASS: all seven pool/active/planned combinations, Done/all history, active Done retained.');
