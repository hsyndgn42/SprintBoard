const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('../frontend/node_modules/typescript');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
const {summaryTotal,pendingQueues,badgeText,bellLabel,EMPTY_SUMMARY,BADGE_MAX,REFRESH_MS}=require('../frontend/src/app/shared/approval-inbox.model.ts');

const queue=(key,label,route,count)=>({key,label,route,count});
const summary={total:14,queues:[
  queue('slack-defect','Slack · defect bildirimi','/backlog',2),
  queue('slack-backlog','Slack · iş isteği','/backlog',0),
  queue('slack-overtime','Slack · mesai bildirimi','/overtime',5),
  queue('leave-request','İzin talebi','/leaves',3),
  queue('overtime-request','Mesai talebi','/overtime',4),
]};

assert.equal(summaryTotal(summary),14,'total is the sum of the queues the panel lists');
assert.equal(summaryTotal(EMPTY_SUMMARY),0,'an empty installation counts zero, never NaN');
assert.equal(summaryTotal({}),0,'a malformed response must not crash the topbar');
assert.equal(summaryTotal({queues:[queue('x','X','/backlog',-3)]}),0,'a negative count never reduces the badge');

assert.deepEqual(pendingQueues(summary).map(q=>q.key),['slack-overtime','overtime-request','leave-request','slack-defect'],'busiest queue first');
assert.ok(!pendingQueues(summary).some(q=>q.count===0),'an empty queue is not news');
assert.deepEqual(pendingQueues(EMPTY_SUMMARY),[]);
assert.deepEqual(pendingQueues({}),[]);
assert.deepEqual(
  pendingQueues({queues:[queue('b','Bal','/overtime',2),queue('a','Ali','/leaves',2)]}).map(q=>q.key),
  ['a','b'],'equal counts fall back to Turkish label order');

assert.equal(summaryTotal(pendingQueues(summary).reduce((acc,q)=>({queues:[...acc.queues,q]}),{queues:[]})),14,'filtering the list never changes the number shown');

assert.equal(badgeText(0),'0');
assert.equal(badgeText(BADGE_MAX),String(BADGE_MAX));
assert.equal(badgeText(BADGE_MAX+1),BADGE_MAX+'+','large counts stay readable in the badge');
assert.equal(badgeText(250),BADGE_MAX+'+');

assert.match(bellLabel(summary,false),/14/,'the label states the count for screen readers');
assert.match(bellLabel(EMPTY_SUMMARY,false),/Onay bekleyen kayıt yok/);
assert.match(bellLabel(summary,true),/okunamadı/,'a failed poll must not claim the queues are clear');
assert.doesNotMatch(bellLabel(summary,true),/14/,'stale counts are not reported as current');

assert.ok(REFRESH_MS>=30000,'polling runs for every open admin session, so it stays slow');

const component=fs.readFileSync('frontend/src/app/shared/sb-approval-bell.component.ts','utf8');
assert.match(component,/\[routerLink\]="queue\.route"/,'each queue links to the page that owns it');
assert.match(component,/aria-haspopup="true"/);
assert.match(component,/\[attr\.aria-expanded\]="open"/);
assert.match(component,/document:keydown\.escape/,'Escape closes the panel');
assert.match(component,/document:click/,'clicking outside closes the panel');
assert.match(component,/removeEventListener\('visibilitychange'/,'polling listeners are released on destroy');
assert.match(component,/clearInterval/,'the poll timer is released on destroy');
assert.match(component,/this\.error \? 0 : summaryTotal/,'a failed poll shows no badge count');

const app=fs.readFileSync('frontend/src/app/app.component.ts','utf8');
assert.match(app,/@if \(auth\.isAdmin\(\)\) \{ <sb-approval-bell>/,'only administrators can act on these queues');

const service=fs.readFileSync('service/src/main/java/com/sprintboard/ApprovalInboxService.java','utf8');
for(const table of ['slack_inbox','slack_backlog_inbox','slack_overtime_inbox','leave_request','overtime_request'])
  assert.ok(service.includes(table),'summary covers '+table);
assert.match(service,/slack_inbox WHERE status IN \('PENDING','INVALID'\)/,'malformed Slack messages still await a decision');

const controller=fs.readFileSync('service/src/main/java/com/sprintboard/ApprovalInboxController.java','utf8');
assert.match(controller,/\/api\/admin\/approvals/,'the admin path carries the existing ADMIN rule');
assert.match(controller,/noStore/,'a polled count must never be cached');

console.log('approval bell OK: queue totals, ordering, badge limit, failed poll, admin gate, listener cleanup and backend coverage of all five queues');
