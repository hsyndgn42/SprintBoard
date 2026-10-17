const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('../frontend/node_modules/typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {BACKLOG_VIEWS,matchesBacklogView}=require('../frontend/src/app/pages/backlog-view.model.ts');
assert.deepEqual(BACKLOG_VIEWS.map(v=>v.label),['Havuz + sprint','Yalnız havuz','Sprintte','Tüm işler','Done işler']);
const rows=[{id:'old',state:'Undone'},{id:'next',state:'Ready',repeatOfId:'old'},{id:'sprint',state:'IN_SPRINT'},{id:'done',state:'Done'}];
const ids=view=>rows.filter(r=>matchesBacklogView(r,view)).map(r=>r.id);
assert.deepEqual(ids('open'),['next','sprint']);assert.deepEqual(ids('Ready'),['next']);
assert.deepEqual(ids('IN_SPRINT'),['sprint']);assert.deepEqual(ids('all'),rows.map(r=>r.id));assert.deepEqual(ids('Done'),['done']);
assert.equal(rows[0].state,'Undone');console.log('Backlog views PASS: five labels, pool/carryover/sprint/Done/all, original Undone preserved.');
