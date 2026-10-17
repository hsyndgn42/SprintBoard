const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('../frontend/node_modules/typescript');
const source=fs.readFileSync('frontend/src/app/pages/roadmap-planning.ts','utf8');
const context={exports:{}};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
const {filterRoadmap,statusLabel,roadmapStatusLabel,roadmapPriorityLabel}=context.exports;
const rows=[
 {id:'a',title:'İletişim',referenceId:'TC-42',status:'active',priority:'LOW',targetDate:'2026-10-10',kind:'PROJECT'},
 {id:'b',title:'BAU',status:'planned',priority:'UNSET',targetDate:null,kind:'GENERAL'},
 {id:'c',title:'Feature',status:'on_hold',priority:'CRITICAL',targetDate:'2026-11-01',kind:'FEATURE_SET'},
 {id:'d',title:'Proje',status:'completed',priority:'HIGH',targetDate:'2026-10-12',kind:'PROJECT'},
];
const base={query:'',status:'',priority:'',kind:'',sort:'priority'};
const ids=f=>Array.from(filterRoadmap(rows,{...base,...f}),r=>r.id);
assert.deepEqual(ids({}),['c','d','a','b']);assert.deepEqual(ids({sort:'date'}),['a','d','c','b']);
assert.deepEqual(ids({sort:'title'}),['b','c','a','d']);assert.deepEqual(ids({query:'iletişim'}),['a']);assert.deepEqual(ids({query:' tc-42 '}),['a']);
assert.deepEqual(ids({kind:'GENERAL'}),['b']);assert.deepEqual(ids({status:'completed'}),['d']);assert.deepEqual(ids({priority:'CRITICAL'}),['c']);
assert.deepEqual(ids({status:'active',priority:'HIGH'}),[]);assert.deepEqual(rows.map(r=>r.id),['a','b','c','d']);
assert.equal(roadmapStatusLabel('on_hold'),'Beklemede');assert.equal(roadmapPriorityLabel('CRITICAL'),'Kritik');
console.log('12 Roadmap model checks PASS: labels, filters, Turkish search, priority/date/title sorting, null dates and input immutability.');
