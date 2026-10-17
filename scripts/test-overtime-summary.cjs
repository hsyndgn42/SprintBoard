const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('../frontend/node_modules/typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {overtimePeople}=require('../frontend/src/app/pages/overtime-summary.model.ts');
const members=[{id:'m',name:'İsa'}],sprints=[{id:'s1',number:1,name:'Sprint 1'},{id:'s2',number:2,name:'Sprint 2'}];
const records=[{id:'r1',memberId:'m',sprintNumber:1,sprintName:'Sprint 1',earnedHours:20,usedCumulativeHours:8,balanceHours:12},{id:'r2',memberId:'m',sprintNumber:2,sprintName:'Sprint 2',earnedHours:10,usedCumulativeHours:11,balanceHours:19}];
const leaves=[{memberId:'m',sprintId:'s1',days:1,leaveType:'OVERTIME',overtimeHours:8,overtimeAccounting:'IN_SNAPSHOT'},{memberId:'m',sprintId:'s2',days:.5,leaveType:'OVERTIME',overtimeHours:4,overtimeAccounting:'DEBIT'},{memberId:'m',sprintId:'s2',days:5,leaveType:'ANNUAL'}];
const entries=[{memberId:'m',sprintId:'s2',earnedHours:2.5,usedHours:0,plannedHours:200}];
const p=overtimePeople(members,records,entries,leaves,sprints)[0];assert.equal(p.earnedHours,32.5);assert.equal(p.usedDays,1.5);assert.equal(p.rows[0].unmatchedUsedHours,3);assert.equal(p.rows[1].unmatchedUsedHours,0);assert.equal(p.rows.length,2);assert.equal(p.rows[0].earnedHours,12.5);
assert.equal(overtimePeople(members,[],[],[],[])[0].rows.length,0);assert.deepEqual(overtimePeople([],[],[],[],[]),[]);
assert.equal(overtimePeople([],[],[{memberId:'gone',memberName:'Geçmiş üye',sprintId:'lost',earnedHours:8,usedHours:2}],[],[])[0].rows[0].unmatchedUsedHours,2);
const path='backups/leave-reconciliation-20261015/apply/after.json';if(fs.existsSync(path)){
 const t=JSON.parse(fs.readFileSync(path,'utf8')).tables;
 const ps=overtimePeople(t.member.map(x=>({id:x.id,name:x.name})),t.overtime_snapshot.map(x=>({...x,id:x.id,memberId:x.member_id,sprintNumber:t.sprint.find(s=>s.id===x.sprint_id).number,earnedHours:x.earned_hours,usedCumulativeHours:x.used_cumulative_hours})),[],t.leave_record.map(x=>({memberId:x.member_id,sprintId:x.sprint_id,leaveType:x.leave_type,days:x.days,overtimeHours:x.overtime_hours,overtimeAccounting:x.overtime_accounting})),t.sprint.map(x=>({id:x.id,number:x.number,name:x.name})));
 for(const [name,h,d] of [['isa',94,5],['gorkem',95,3],['akin',42,3],['elcim',40,4],['umran',0,0],['cemil',0,0]]){const p=ps.find(x=>x.memberId==='legacy-member-'+name);assert.equal(p.earnedHours,h);assert.equal(p.usedDays,d);}
 assert.equal(ps.find(x=>x.memberId==='legacy-member-isa').rows.find(x=>x.number===16).unmatchedUsedHours,3);
}
console.log('Overtime summary PASS: actual reconciled totals, cumulative usage not summed, no snapshot/debit duplication, annual/plan excluded, fractions, unmatched hours, empty and former members.');
