const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('../frontend/node_modules/typescript');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
const {POOL_CHOICE,repeatTargets,addTargets,defaultAddTarget,sprintOptionLabel,addTargetLabel,repeatSuccessMessage}=require('../frontend/src/app/pages/sprint-target.model.ts');

const sprint=(id,name,status,start,end,number)=>({id,name,status,start,end,number});
const sprints=[
  sprint('s-closed','Sprint 10','completed','2030-01-07','2030-01-25',10),
  sprint('s-later','Sprint 13','planned','2030-03-04','2030-03-22',13),
  sprint('s-active','Sprint 11','active','2030-02-03','2030-02-21',11),
  sprint('s-soon','Sprint 12','planned','2030-02-24','2030-03-01',12),
];

assert.deepEqual(repeatTargets(sprints).map(s=>s.id),['s-soon','s-later'],'only sprints that have not started, soonest first');
assert.deepEqual(repeatTargets([]),[],'no planned sprint means the pool is the only destination');
assert.deepEqual(repeatTargets(null),[],'a failed sprint load must not crash the dialog');
assert.ok(!repeatTargets(sprints).some(s=>s.status==='active'),'an active sprint is a scope change and is never offered here');
assert.ok(!repeatTargets(sprints).some(s=>s.status==='completed'),'a closed sprint can never take new work');

assert.deepEqual(
  repeatTargets([sprint('b','B sprint','planned','2030-02-24','2030-03-01',2),sprint('a','A sprint','planned','2030-02-24','2030-03-01',1)]).map(s=>s.id),
  ['a','b'],'same start date falls back to sprint number');

assert.equal(POOL_CHOICE,'','the pool is the default, so submitting without a choice stays safe');
assert.match(sprintOptionLabel(sprints[1]),/Sprint 13/);
assert.match(sprintOptionLabel(sprints[1]),/2030-03-04 → 2030-03-22/,'dates tell the operator which sprint is which');

// Pool work, unlike a repeat, may also go to the running sprint — with a reason.
assert.deepEqual(addTargets(sprints).map(s=>s.id),['s-active','s-soon','s-later'],'running sprint first, then upcoming ones by date');
assert.ok(!addTargets(sprints).some(s=>s.status==='completed'),'a closed sprint can never take new work');
assert.deepEqual(addTargets([]),[]);
assert.deepEqual(addTargets(null),[],'a failed sprint load must not crash the dialog');

assert.equal(defaultAddTarget(sprints),'s-active','most work lands in the running sprint, so it is preselected');
assert.equal(defaultAddTarget(sprints.filter(s=>s.status!=='active')),'s-soon','without a running sprint the nearest upcoming one is preselected');
assert.equal(defaultAddTarget([]),'','no sprint means no preselected target');

assert.match(addTargetLabel(sprints[2]),/Aktif$/,'the running sprint is marked because it demands a reason');
assert.match(addTargetLabel(sprints[3]),/Planlanan$/);
assert.match(addTargetLabel(sprints[3]),/Sprint 12/);

assert.match(repeatSuccessMessage({id:'b2',sprintId:null,taskId:null},''),/havuz/i,'the pool result names the pool');
assert.match(repeatSuccessMessage({id:'b2',sprintId:'s-soon',taskId:'t1'},'Sprint 12'),/Sprint 12/,'the sprint result names the sprint');
assert.doesNotMatch(repeatSuccessMessage({id:'b2',sprintId:'s-soon',taskId:'t1'},'Sprint 12'),/havuz/i);
assert.equal(repeatSuccessMessage(null,'Sprint 12'),'','no result means no success claim');

const warned=repeatSuccessMessage({id:'b2',sprintId:'s-soon',taskId:'t1',readinessWarnings:['Bağımlılığı açık','Efor girilmemiş']},'Sprint 12');
assert.match(warned,/Sprint 12/,'the work was still planned');
assert.match(warned,/Bağımlılığı açık · Efor girilmemiş/,'warnings are surfaced, not swallowed');
assert.doesNotMatch(repeatSuccessMessage({id:'b2',sprintId:'s-soon',taskId:'t1',readinessWarnings:[]},'Sprint 12'),/uyarı/i);

const dialog=fs.readFileSync('frontend/src/app/pages/backlog-repeat-dialog.component.ts','utf8');
assert.match(dialog,/Backlog havuzuna ekle/,'the pool is an explicit choice, not an empty option');
assert.match(dialog,/data-modal-dismiss/,'Escape has something to close');
assert.match(dialog,/aria-labelledby="repeat-title"/);
assert.match(dialog,/\[disabled\]="saving\|\|loading"/,'a double submit cannot create two copies');
assert.match(dialog,/repeated\.emit\(repeatSuccessMessage/,'the dialog reports success instead of closing silently');
assert.match(dialog,/await this\.api\.post<RepeatResult>[\s\S]{0,220}this\.repeated\.emit/,'success is only reported after the server accepted the repeat');
assert.doesNotMatch(dialog,/catch\([^)]*\)\s*\{[^}]*repeated\.emit/,'a failed repeat never reports success');

const backlog=fs.readFileSync('frontend/src/app/pages/backlog.component.ts','utf8');
assert.match(backlog,/\(click\)="repeat\(item\)"/);
assert.match(backlog,/<app-backlog-repeat-dialog \[itemId\]="repeatItem\.id"/,'the button opens the dialog rather than posting straight away');
assert.match(backlog,/repeatDone\(message: string\)[\s\S]{0,120}this\.closeRepeat\(\);[\s\S]{0,60}savedMessage = message/,'success closes the dialog and shows the message');
assert.match(backlog,/@if \(savedMessage\) \{ <p class="inline-success" role="status">/,'the message is announced, not just drawn');
assert.match(backlog,/sprintTargetCount\) \{ <button class="btn small" \(click\)="addToSprint\(item\)">Sprinte al/,'pool work can be planned whenever any sprint can take it, not only a running one');
assert.doesNotMatch(backlog,/Aktif sprinte al/,'the action is no longer limited to the running sprint');
assert.match(backlog,/<app-sprint-add-dialog \[backlogId\]="addItemId"/,'no fixed sprint is passed, so the dialog asks which one');
assert.match(backlog,/taskAdded\(sprintName:string=''\)[\s\S]{0,160}savedMessage = sprintName/,'adding to a sprint reports where the work went');

const addDialog=fs.readFileSync('frontend/src/app/pages/sprint-add-dialog.component.ts','utf8');
assert.match(addDialog,/get chooseSprint\(\)\{return !this\.sprintId;\}/,'the sprint screen keeps its own sprint fixed');
assert.match(addDialog,/get targetSprintId\(\)\{return this\.sprintId\|\|this\.chosenId;\}/);
assert.match(addDialog,/get canSubmit\(\)\{return !!this\.targetSprintId&&/,'work cannot be submitted without a destination');
assert.match(addDialog,/this\.chosenId=id;this\.reserveTaskId='';this\.emergency=false;/,'switching sprint drops choices that belonged to the previous one');
assert.match(addDialog,/this\.active=sprint\.status==='active'/,'the reason field follows the chosen sprint, not the opener');
assert.match(addDialog,/Eklenebilecek aktif ya da planlanan sprint yok/,'an installation with no usable sprint says so');

const controller=fs.readFileSync('service/src/main/java/com/sprintboard/ApiController.java','utf8');
assert.match(controller,/repeatBacklog\(@PathVariable String id, @RequestBody\(required = false\)/,'the sprint-less call site keeps working without a body');

const service=fs.readFileSync('service/src/main/java/com/sprintboard/WorkspaceService.java','utf8');
assert.match(service,/if \(!"planned"\.equals\(states\.getFirst\(\)\)\)/,'only a sprint that has not started can take a repeat');

console.log('sprint targets OK: repeat is planned-only, pool work reaches active or planned sprints, defaults, labels, warning reporting and dialog guards');
