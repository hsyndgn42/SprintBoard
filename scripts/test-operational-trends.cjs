const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('../frontend/node_modules/typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {overtimeTrend,defectTrend,overtimeSectionHtml,trendSvg,defectSeries}=require('../frontend/src/app/pages/operational-trends.model.ts');
const {supportDefectsHtml}=require('../frontend/src/app/pages/defect-support-review.ts');
const {buildReview}=require('../frontend/src/app/pages/review.model.ts');
const {reportTabHtml}=require('../frontend/src/app/pages/report-tab-html.ts');
const sprints=[{id:'s2',number:2,name:'Sprint 2',status:'active'},{id:'s1',number:1,name:'Sprint <1>',status:'completed'},{id:'s3',number:3,name:'Sprint 3',status:'planned'}];
const records=[{id:'a',memberId:'m',memberName:'Private',sprintNumber:1,sprintName:'Sprint <1>',earnedHours:10,usedCumulativeHours:8},{id:'b',memberId:'m',memberName:'Private',sprintNumber:2,sprintName:'Sprint 2',earnedHours:5,usedCumulativeHours:8}];
const entries=[{memberId:'m',sprintId:'s2',earnedHours:3,plannedHours:4,usedHours:0}];
const leaves=[{memberId:'m',sprintId:'s1',leaveType:'OVERTIME',days:1,overtimeHours:8,overtimeAccounting:'IN_SNAPSHOT'},{memberId:'m',sprintId:'s2',leaveType:'ANNUAL',days:2}];
const original=JSON.stringify({sprints,records,entries,leaves});
const rows=overtimeTrend(sprints,records,entries,leaves);
const matchingEntries=[
 {id:'p',memberId:'m',sprintId:'s2',plannedHours:16,earnedHours:0,planActualHours:20},
 {id:'a',memberId:'m',sprintId:'s2',plannedHours:0,earnedHours:20,planId:'p',planClassification:'PLANNED'},
 {id:'b',memberId:'m',sprintId:'s2',plannedHours:0,earnedHours:3,planClassification:'UNPLANNED'},
 {id:'unused',memberId:'m',sprintId:'s2',plannedHours:8,earnedHours:0,planActualHours:0}
];
const match=overtimeTrend(sprints,records,matchingEntries,[], 'm')[1];
assert.equal(match.earned,28);assert.equal(match.planned,24);assert.equal(match.matched,16);assert.equal(match.remaining,8);assert.equal(match.excess,4);assert.equal(match.unplanned,3);assert.equal(match.unclassified,5);
assert.equal(match.earned,match.matched+match.excess+match.unplanned+match.unclassified);
assert(overtimeSectionHtml([match]).includes('4 sa aşan'));
const cancelled=overtimeTrend(sprints,[],matchingEntries.map(e=>e.id==='p'?{...e,plannedHours:0}:e),[],'m')[1];
assert.equal(cancelled.matched,0);assert.equal(cancelled.excess,20);assert.equal(cancelled.earned,23);assert.equal(cancelled.remaining,8);
const mixedEntries=[...entries,{memberId:'other',memberName:'Other',sprintId:'s2',earnedHours:50,plannedHours:12,usedHours:0}];
const mixedLeaves=[...leaves,{memberId:'other',memberName:'Other',sprintId:'s2',leaveType:'OVERTIME',days:2,overtimeHours:16}];
assert.deepEqual(overtimeTrend(sprints,records,mixedEntries,mixedLeaves,'m'),rows);
const other=overtimeTrend(sprints,records,mixedEntries,mixedLeaves,'other');
assert.equal(other[1].earned,50);assert.equal(other[1].planned,12);assert.equal(other[1].usedDays,2);
assert(overtimeSectionHtml(other).includes('Mesaiden izin'));
assert.deepEqual(rows.map(r=>r.earned),[10,8,0]);assert.deepEqual(rows.map(r=>r.planned),[0,4,0]);
assert.deepEqual(rows.map(r=>r.usedDays),[1,0,0]);assert.equal(rows[0].unmatchedUsedHours,0);
assert.equal(original,JSON.stringify({sprints,records,entries,leaves}));
const html=overtimeSectionHtml(rows,'s2');assert(html.includes('8 sa gerçekleşen'));assert(!html.includes('Private'));assert(!html.includes('S3'));
assert(!reportTabHtml({kind:'overtime',rows,scope:'all'}).includes('Sprint <1>'));assert(reportTabHtml({kind:'overtime',rows,scope:'all'}).includes('Sprint &lt;1&gt;'));
const buckets=[{sprintId:'s1',subtype:'TEST_DEFECT',severity:'HIGH',environment:'SAT',status:'done',count:2},{sprintId:'s2',subtype:'PROD_DEFECT',severity:'LOW',environment:'PROD',status:'doing',count:1}];
const trend=defectTrend(sprints,buckets,'all');
assert.deepEqual(trend.map(r=>r.test),[2,0,0]);assert.deepEqual(trend.map(r=>r.prod),[0,1,0]);assert.deepEqual(trend.map(r=>r.done),[2,0,0]);
assert.equal(defectTrend(sprints,buckets,'pool').length,0);
assert.equal(defectTrend(sprints,buckets,'s2','','HIGH').at(0).prod,0);
assert.equal(defectTrend(sprints,buckets,'all','','','SAT')[1].prod,0);
assert(!trendSvg([],[],'iş').includes('NaN'));assert(!trendSvg(['s1'],defectSeries(trend.slice(0,1)),'iş').includes('Infinity'));
const task=(subtype,status)=>({id:subtype,taskCategory:'DEFECT',taskSubtype:subtype,status,reserveTaskId:'r',name:'SECRET DEFECT',defect:{reporterName:'SECRET NAME'},assignments:[]});
const sprint={items:[task('TEST_DEFECT','done'),task('PROD_DEFECT','doing'),{...task('PROD_DEFECT','undone'),reserveTaskId:null}]};
const support=supportDefectsHtml(sprint);assert(support.includes('2 defect'));assert(support.includes('Test Defect'));assert(support.includes('Prod Defect'));assert(!support.includes('SECRET'));assert(support.includes('1 Açık'));
const model=buildReview(sprint,{hoursPerDay:8,estimationMode:'SIZE_AND_HOURS'});assert.deepEqual(model.typeDistribution.map(r=>[r.key,r.count]),[['TEST_DEFECT',1],['PROD_DEFECT',2]]);assert.equal(model.categories[0].count,3);
console.log('Operational trends PASS: historical + approved entries, no double usage, zero periods, sorted/filter scope, immutable inputs, safe HTML, Test/Prod and summary-only support.');
