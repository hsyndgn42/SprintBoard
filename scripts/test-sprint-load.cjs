const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('../frontend/node_modules/typescript');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
const {sprintLoad,loadWith,loadMessage,loadOverruns}=require('../frontend/src/app/sprint-load.model.ts');

const task=(estimatedHours,assignments=[],extra={})=>({id:'t'+Math.random(),estimatedHours,assignments,workKind:'DEV',...extra});
const a=(memberId,estimatedHours,supportOnly=false)=>({memberId,memberName:memberId,estimatedHours,supportOnly});
const row=(memberId,availableHours)=>({memberId,memberName:memberId,availableHours});

// Effort that is estimated but not yet handed to anyone is the part a per-person view cannot show.
let load=sprintLoad([task(10,[a('m1',4)]),task(6)],[row('m1',20),row('m2',20)]);
assert.equal(load.capacity,40);
assert.equal(load.assigned,4,'only hours actually handed to a person count as assigned');
assert.equal(load.unassigned,12,'6 of the first task plus all 6 of the unowned task');
assert.equal(load.planned,16);
assert.equal(load.free,24);
assert.equal(load.over,0);

// Leave is already subtracted from capacity in days, so counting it again would double-charge the team.
assert.equal(sprintLoad([task(8,[a('m1',8)],{workKind:'LEAVE'})],[row('m1',20)]).planned,0,'leave is not sprint effort');
assert.equal(sprintLoad([task(8,[a('m1',8)],{workKind:'DEV',taskSubtype:'LEAVE'})],[row('m1',20)]).planned,0,'leave detected by subtype too');

// X support consumes no hours, so it must not inflate the load.
assert.equal(sprintLoad([task(0,[a('m1',0,true)])],[row('m1',20)]).planned,0,'X support adds no hours');
assert.equal(sprintLoad([task(5,[a('m1',9,true)])],[row('m1',20)]).unassigned,5,'an X-only task leaves its whole estimate unowned');

// Over-assigning a task must not create negative unassigned hours that hide real load.
assert.equal(sprintLoad([task(4,[a('m1',10)])],[row('m1',20)]).unassigned,0,'assigning more than the estimate never goes below zero');
assert.equal(sprintLoad([task(4,[a('m1',10)])],[row('m1',20)]).planned,10,'the larger of the two is what the team must actually do');

// Missing capacity rows mean unknown, not zero: a warning here would be a false alarm.
const unknown=sprintLoad([task(10)],[]);
assert.equal(unknown.capacityKnown,false);
assert.equal(loadOverruns(unknown,40),false,'no capacity record must never raise an overrun warning');
assert.match(loadMessage(unknown,40),/kapasite kaydı yok/,'the operator is told why no number is shown');

assert.equal(sprintLoad(null,null).planned,0,'a failed load must not crash the dialog');
assert.equal(sprintLoad([task(NaN),task(-5)],[row('m1',NaN)]).planned,0,'broken numbers are treated as zero, not NaN');

// Adding from the backlog: nobody owns the new item yet.
const base=sprintLoad([task(30,[a('m1',30)])],[row('m1',40)]);
assert.equal(base.free,10);
assert.equal(loadOverruns(base,8),false,'8 hours still fit in the 10 hour gap');
assert.equal(loadOverruns(base,12),true,'12 hours do not');
assert.equal(loadWith(base,12).over,2);
assert.equal(loadWith(base,12).unassigned,12,'the added item is unowned effort');
assert.equal(loadWith(base,12).assigned,30,'adding from the backlog changes nobody\'s assignment');

// Creating new work can name owners straight away, so the split must stay truthful.
const created=loadWith(base,2,6);
assert.equal(created.assigned,36,'hours given to people in the form are assigned');
assert.equal(created.unassigned,2,'the remainder of the estimate is still unowned');
assert.equal(created.planned,38,'the total is what matters for the capacity check');
assert.equal(loadWith(base,8,0).planned,created.planned,'same total effort gives the same capacity verdict');

// The warning must name the overrun explicitly rather than just showing numbers.
assert.match(loadMessage(base,12),/2 sa aşılır/,'the operator sees how much over they are');
assert.match(loadMessage(base,4),/6 sa boşluk/,'and how much room is left when it fits');

// A sprint with no capacity at all is known-zero, which is a real overrun, not unknown.
const zero=sprintLoad([],[row('m1',0)]);
assert.equal(zero.capacityKnown,true);
assert.equal(loadOverruns(zero,1),true,'zero recorded capacity does flag an overrun');

console.log('sprint load checks passed');
