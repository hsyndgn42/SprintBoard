const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('../frontend/node_modules/typescript');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
const {startedWork,isBau,effectiveTaskStatus}=require('../frontend/src/app/task-lifecycle.ts');

const task=(extra={})=>({id:'t1',status:'todo',taskCategory:'DEV',workKind:'DEV',...extra});

// Work nobody has touched can go back to the pool without distorting any report.
assert.equal(startedWork(task()),false,'a Todo task is a clean planning correction');
assert.equal(startedWork(task({status:''})),false,'a missing status is treated as untouched, not as progress');
assert.equal(startedWork(task({status:undefined})),false,'an absent status must not crash or warn');

// Anything past Todo means hours were spent that the product never records, so returning it hides real load.
assert.equal(startedWork(task({status:'doing'})),true,'work in progress consumed capacity');
assert.equal(startedWork(task({status:'review'})),true,'review is still spent effort');
assert.equal(startedWork(task({status:'undone'})),true,'undone work was attempted');
assert.equal(startedWork(task({status:'done'})),true,'done work is never a planning correction');

// A blocker is raised by someone who picked the task up, even if the column never moved.
assert.equal(startedWork(task({blocker:{blocked:true,version:1}})),true,'a live blocker proves the task was picked up');
assert.equal(startedWork(task({status:'todo',blocker:{blocked:false,version:2}})),false,'a cleared blocker on a Todo task is not ongoing work');
assert.equal(startedWork(task({blocker:null})),false,'no blocker record must not be read as progress');

// BAU and leave are capacity reservations, not delivery work, so the warning would be noise.
assert.equal(startedWork(task({taskCategory:'BAU',status:'doing'})),false,'BAU reserve is planning, not spent delivery effort');
assert.equal(startedWork(task({workKind:'LEAVE',status:'doing'})),false,'leave is already subtracted from capacity');
assert.equal(startedWork(task({taskSubtype:'LEAVE',status:'doing'})),false,'leave detected by subtype too');

// The existing helpers must keep their meaning; the warning relies on isBau agreeing with them.
assert.equal(isBau(task({taskCategory:'BAU'})),true);
assert.equal(effectiveTaskStatus(task({taskCategory:'BAU',status:'todo'})),'done','BAU is not manually progressed');
assert.equal(effectiveTaskStatus(task({status:'doing'})),'doing');

console.log('task lifecycle checks passed: started-work warning covers progress, blockers, BAU and leave');
