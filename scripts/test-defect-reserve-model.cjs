const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('../frontend/node_modules/typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {buildReview}=require('../frontend/src/app/pages/review.model.ts'),{planningInsights,assignmentPreview}=require('../frontend/src/app/planning-insights.model.ts');
const {reserveHtml}=require('../frontend/src/app/pages/defect-reserve-html.ts'),{reportTabHtml}=require('../frontend/src/app/pages/report-tab-html.ts'),{editorialSprintHtml}=require('../frontend/src/app/pages/presentation-html.ts');
const a=(id,h)=>({memberId:id,memberName:id,estimatedHours:h,supportOnly:false});
const items=[{id:'r',name:'Support',taskCategory:'BAU',taskSubtype:'DEFECT_SUPPORT',status:'todo',estimatedHours:24,planningHours:6,assignments:[{...a('A',16),planningHours:6},{...a('B',8),planningHours:0}]},{id:'d',name:'Issue',taskCategory:'DEFECT',taskSubtype:'PROD_DEFECT',status:'doing',estimatedHours:22,planningHours:22,reserveTaskId:'r',assignments:[a('A',10),a('B',12)]}];
const settings={hoursPerDay:8,estimationMode:'SIZE_AND_HOURS'},sprint={id:'s',name:'Sprint QA',number:17,status:'active',start:'2027-01-01',end:'2027-01-22',items};
const {buildScope}=require('../frontend/src/app/pages/scope-summary.model.ts');assert.equal(buildScope(sprint).currentHours,28);
let r=buildReview(sprint,settings);assert.equal(r.bauHours+r.deliveryHours,28);assert.equal(r.done,0);assert.equal(r.bau[0].status,'done');
let p=planningInsights(items,[],'SIZE_AND_HOURS');assert.equal(p.people.find(x=>x.id==='A').hours,16);assert.equal(p.people.find(x=>x.id==='B').hours,12);
p=planningInsights(assignmentPreview(items,'d',[a('A',20)]),[],'SIZE_AND_HOURS');assert.equal(p.people.find(x=>x.id==='A').hours,20);assert.equal(p.people.find(x=>x.id==='B').hours,8);
assert.equal(items[0].planningHours,6);assert.equal(items[1].assignments[0].estimatedHours,10);
const summary={taskId:'r',name:'<script>unsafe</script>',members:[{memberId:'A',memberName:'A',reservedHours:16,allocatedHours:10,remainingHours:6,overHours:0,coveredHours:10}],defectCount:1,reservedHours:16,allocatedHours:10,remainingHours:6,overHours:0,coveredHours:10,unassignedDefectHours:0};
for(const html of [reserveHtml([summary]),reportTabHtml({kind:'defects',scope:'QA',rows:[],charts:[],counts:{done:0,open:0,undone:0},reserves:[summary]})]){assert(html.includes('Defect Support'));assert(html.includes('16 sa'));assert(html.includes('&lt;script&gt;'));assert(!html.includes('<script>unsafe'));assert(!/NaN|Infinity/.test(html));}
const reviewHtml=editorialSprintHtml({...sprint,items:items.map(t=>t.id==='d'?{...t,name:'Issue <script>unsafe</script>',defect:{reporterId:'U123456',reporterName:'Ada Yılmaz'}}:t),defectReserves:[summary]},settings,'2026-10-16T00:00:00Z');
assert(reviewHtml.includes('Defect Support kapsamında alınan işler'));assert(!reviewHtml.includes('Bildiren: Ada Yılmaz'));assert(!reviewHtml.includes('Rezerv ve plan'));assert(reviewHtml.includes('&lt;script&gt;'));assert(!reviewHtml.includes('<script>unsafe'));
assert.equal(reserveHtml([]),'');
console.log('Defect reserve models PASS: per-person offset/overage, preview without mutation, BAU independent outcome, Review/report HTML and escaping.');
