const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('../frontend/node_modules/typescript');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
const {roadmapWork,workAnalysis,workStage,workResult,emptyWorkFilters}=require('../frontend/src/app/pages/roadmap-detail.model.ts');
const item=(id,patch={})=>({id,roadmapId:'r1',title:id,state:'IN_SPRINT',taskCategory:'DEV',taskSubtype:null,sprintId:'s1',sprintName:'Sprint 16',sprintStatus:'active',taskStatus:'todo',estimatedHours:8,...patch});
const rows=[
  item('done',{taskStatus:'done',sprintStatus:'completed'}),
  item('undone',{taskStatus:'undone',sprintStatus:'completed'}),
  item('doing',{taskStatus:'doing'}),
  item('planned',{sprintId:'s2',sprintName:'Sprint 17',sprintStatus:'planned'}),
  item('pool',{sprintId:null,sprintStatus:null,state:'Ready',taskStatus:null}),
  item('TEST',{taskCategory:'DEFECT',taskSubtype:'TEST_DEFECT'}),
  item('PROD',{taskCategory:'DEFECT',taskSubtype:'PROD_DEFECT'}),
  item('İzin',{taskCategory:'BAU',taskSubtype:'LEAVE',taskStatus:'done'}),
  item('foreign',{roadmapId:'other',taskStatus:'done'}),
];
const filter=(patch={})=>roadmapWork(rows,'r1',{...emptyWorkFilters(),...patch});
assert.equal(filter().length,8,'never includes another roadmap');
assert.equal(filter({result:'open'}).length,6);
assert.deepEqual(filter({result:'done'}).map(i=>i.id),['done','İzin']);
assert.deepEqual(filter({result:'open',stage:'completed'}).map(i=>i.id),['undone'],'closed sprint does not close undone work');
assert.deepEqual(filter({stage:'planned'}).map(i=>i.id),['planned']);
assert.deepEqual(filter({sprintId:'s2',category:'DEV'}).map(i=>i.id),['planned']);
assert.equal(filter({stage:'pool',sprintId:'s2'}).length,0,'contradictory filters show no results');
assert.deepEqual(filter({query:'izin'}).map(i=>i.id),['İzin'],'Turkish case folding');
assert.equal(workResult(item('planned-done',{sprintStatus:'planned',taskStatus:'done'})),'planned');
assert.equal(workResult(item('returned',{sprintId:null,state:'Ready',taskStatus:'undone'})),'pool','pool wins over stale previous result');
assert.equal(workStage(item('missing',{sprintStatus:null})),'unknown');
assert.equal(workResult(item('missing',{taskStatus:'invalid'})),'unknown');
const all=workAnalysis(filter());
assert.deepEqual([all.total,all.done,all.open,all.planned,all.rate],[8,2,6,1,25]);
for(const series of [all.results,all.stages,all.types])assert.equal(series.reduce((sum,r)=>sum+r.count,0),8,'charts reconcile to filtered records');
assert.ok(all.types.some(r=>r.key==='TEST_DEFECT')&&all.types.some(r=>r.key==='PROD_DEFECT'),'separate defect types');
assert.equal(workAnalysis([]).rate,null,'empty is unknown, not zero');
const html=fs.readFileSync('frontend/src/app/pages/roadmap-detail.component.html','utf8');
assert.match(html,/<app-list-pager[^>]*\[items\]="visible"/);
assert.match(html,/scope="col"/);
assert.match(html,/FİLTRELERDEN BAĞIMSIZ/);
assert.match(html,/app-backlog-history/);
assert.match(html,/mesai ve havuz tahmini plana eklenmez/);
console.log('roadmap detail OK: scoped filters, completed sprint vs done, empty data, charts, defect types, pagination and independent effort context');
