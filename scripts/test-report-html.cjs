const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('../frontend/node_modules/typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {reportTabHtml}=require('../frontend/src/app/pages/report-tab-html.ts');
const settings={estimationMode:'SIZE_AND_HOURS',hoursPerDay:8};
const bad='<script>PRIVATE SCRIPT</script><img src="https://unsafe.test">';
const estimates={sizeSmall:1,sizeMedium:1,sizeLarge:0,sizeXLarge:0,pointedTasks:1,storyPointsTotal:5};
const rows={
 delivery:[{id:'s1',number:1,name:bad,end:'2026-01-01',tasks:2,done:1,undone:1,deliveryRate:50,...estimates}],
 members:[{memberName:bad,taskCount:2,effortHours:16,done:1,undone:1,other:0,supportTaskCount:1,...estimates}],
 types:[{taskCategory:'TEST',taskSubtype:'E2E_TEST',taskCount:2,effortHours:16,done:1,undone:1}],
 context:[{memberId:'m',memberName:bad,sprintId:'s1',sprintName:'Sprint 1',sprintNumber:1,capacitySource:'RECALCULATED',availableHours:24,effortHours:16,leaveDays:1,supportTaskCount:2,allocatedDays:4,nonWorkingDays:0,overtimeHours:0}],
 roadmap:[{title:bad,kind:'PROJECT',referenceId:'TC-123',taskCount:3,done:1,undone:1,open:1,assignedHours:24,doneHours:8,undoneHours:8,openHours:8,poolCount:1,poolEstimatedHours:40,supportAssignmentCount:1,unassignedTaskCount:0}],
 capacity:[{name:'Sprint 1',capacity:24,corePlanned:16,supportPlanned:8,planned:24,known:1,unknown:0,people:2,supportPeople:1,coreRatio:66.67,over:0,free:8,frozen:0,recalculated:1}],
 defects:[{title:bad,subtype:'Test Defect',sprint:'Sprint 1',status:'Done',severity:'Yüksek',environment:'Test',reporter:'Slack · U123456'}]
};
for(const kind of Object.keys(rows)){
 const input={kind,rows:rows[kind].map(r=>({...r,password:'SECRET-PASSWORD',statusNote:'SECRET-NOTE',csrfToken:'SECRET-TOKEN'})),settings,scope:'FILTER '+bad,charts:[{title:'Önem dağılımı',rows:[{label:'Yüksek',count:1}]}],counts:{done:1,open:0,undone:0}};
 const html=reportTabHtml(input,'2026-10-16T00:00:00Z');
 assert(html.includes('data-report="'+kind+'"'));assert(html.includes('&lt;script&gt;'));assert(!/<script|<img|<iframe|<form|<input|<button/.test(html));assert(!html.includes('SECRET-'));assert(!/NaN|Infinity/.test(html));assert(html.includes("default-src 'none'"));assert(html.includes('İstanbul saati'));assert(html.includes('FILTER '));
 const empty=reportTabHtml({...input,rows:[],charts:[],counts:{done:0,open:0,undone:0}});
 assert(!/NaN|Infinity/.test(empty));assert(empty.includes('Seçili kapsamda kayıt yok')||empty.includes('Sprint bazlı katılım'));
}
const html=kind=>reportTabHtml({kind,rows:rows[kind],settings,scope:'scope'});
assert(html('roadmap').includes('TC-123'));assert(html('roadmap').includes('40 sa (ayrı)'));
assert(html('context').includes('1 gün izin'));assert(html('context').includes('2 X'));assert(html('context').includes('Kişi bazlı izin günü'));
assert(html('capacity').includes('Support/Architect'));assert(html('capacity').includes('16 / 8 sa'));
const missing=reportTabHtml({kind:'delivery',rows:[{...rows.delivery[0],deliveryRate:null}],settings,scope:'x'});
assert(missing.includes('— · Teslimat işi yok'));assert(!missing.includes('Done oranı: <b>0 %'));
const unknown=reportTabHtml({kind:'context',rows:[{...rows.context[0],availableHours:null,allocatedDays:null}],scope:'x'});
assert(unknown.includes('Plan/kapasite —'));assert(unknown.includes('— sa'));
const sp=reportTabHtml({kind:'members',rows:rows.members,settings:{...settings,estimationMode:'POINTS_AND_HOURS'},scope:'x'});
assert(sp.includes('5 SP'));assert(!sp.includes('Size dağılımı'));
assert.deepEqual(rows.members[0].effortHours,16);
console.log('Per-tab HTML models PASS: 7 allowlisted reports, scope/escaping/CSP, empty/zero/missing, Size/SP, capacity/Support/X/leave semantics, separate pool, no secrets or mutation.');
