// Disposable H2 only: modifies task status, closes the test sprint, creates a viewer.
const {mkdirSync,writeFileSync}=require('node:fs');const {join}=require('node:path');
module.exports=async({evaluate,command,navigate,clickButton,setFieldValue,sleep,events})=>{
  const dir=join('tmp','board-audit');mkdirSync(dir,{recursive:true});
  async function wait(expression,label){for(let i=0;i<70;i++){if(await evaluate(expression))return;await sleep(100);}throw Error(label);}
  async function click(selector){const p=JSON.parse(await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing '+${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2});})()`));await command('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await command('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});}
  async function api(path,body){return JSON.parse(await evaluate(`(async()=>{const s=await(await fetch('/api/auth/session')).json();const r=await fetch('/api'+${JSON.stringify(path)},{method:${JSON.stringify(body===undefined?'GET':'POST')},headers:{'Content-Type':'application/json','X-CSRF-TOKEN':s.csrfToken},${body===undefined?'':`body:JSON.stringify(${JSON.stringify(body)}),`}});if(!r.ok)throw Error('Fixture API '+r.status);return JSON.stringify(await r.json());})()`));}
  async function board(id){await navigate('sprints/'+id+'/board','İşlerin durumu');await wait('!!document.querySelector("app-sprint-board .task-card")','Pano not loaded');}
  async function ids(){return JSON.parse(await evaluate('JSON.stringify([...document.querySelectorAll("app-sprint-board .task-card")].map(e=>e.dataset.taskId).sort())'));}
  async function check(expected,label){const actual=await ids();if(JSON.stringify(actual)!==JSON.stringify(expected.map(t=>t.id).sort()))throw Error(label+': '+actual.length+' vs '+expected.length);if(!await evaluate('document.querySelector(".board-count strong").textContent==='+JSON.stringify(expected.length+' / '+sprint.items.length+' görev')))throw Error('Wrong visible/total count: '+label);}
  async function shot(name){writeFileSync(join(dir,name+'.png'),Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'));}
  async function loginAs(username,password){await click('.topbar form[action="/logout"] button');await wait('!!document.querySelector("app-auth [name=username]")','Logout failed');await setFieldValue('app-auth [name=username]',username);await setFieldValue('app-auth [name=password]',password);await click('app-auth button[type=submit]');await wait('document.querySelector(".session-identity strong")?.textContent==='+JSON.stringify(username),'Login failed');}
  const sprint=await api('/sprints/legacy-sprint-14'),before=JSON.stringify(sprint.items);
  const task=sprint.items.find(t=>t.workKind!=='LEAVE'&&t.assignments.length>0),person=task.assignments[0];
  await board(sprint.id);await check(sprint.items,'Initial count');
  await setFieldValue('[name=boardMember]',person.memberId);await check(sprint.items.filter(t=>t.assignments.some(a=>a.memberId===person.memberId)),'Member including multiple assignments');
  await setFieldValue('[name=boardCategory]',task.taskCategory);await check(sprint.items.filter(t=>t.taskCategory===task.taskCategory&&t.assignments.some(a=>a.memberId===person.memberId)),'AND category');
  if(task.taskSubtype){await setFieldValue('[name=boardSubtype]',task.taskSubtype);await check(sprint.items.filter(t=>t.taskCategory===task.taskCategory&&t.taskSubtype===task.taskSubtype&&t.assignments.some(a=>a.memberId===person.memberId)),'AND subtype');}
  await setFieldValue('[name=boardCategory]','TEST');if(await evaluate('document.querySelector("[name=boardSubtype]").value')!=='')throw Error('Category did not clear subtype');
  await clickButton('Filtreleri temizle');await check(sprint.items,'Reset');
  await setFieldValue('[name=boardMember]','__unassigned__');await check(sprint.items.filter(t=>!t.assignments.length),'Unassigned');await clickButton('Filtreleri temizle');
  await setFieldValue('[name=boardQuery]','qa-no-match-98271');await check([],'Empty query');if(!await evaluate('document.querySelector(".board-empty").innerText.includes("Filtrelere uygun")'))throw Error('Empty state absent');await clickButton('Tüm görevleri göster');
  const selector='[data-task-id="'+task.id+'"] .board-task-title';
  await click(selector);await wait('!!document.querySelector(".board-detail")','Detail missing');
  if(!await evaluate('document.querySelector(".board-detail").innerText.includes('+JSON.stringify(task.criteria||'Kapsam ve kabul ölçütü belirtilmemiş.')+')'))throw Error('Criteria missing');
  if(!await evaluate('document.querySelector(".board-detail").contains(document.activeElement) && !!document.querySelector(".topbar").closest("[inert]")'))throw Error('Detail focus/background');
  for(const [key,code,virtual,modifiers] of [['Tab','Tab',9,0],['Tab','Tab',9,8],[' ','Space',32,0]]){await command('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:virtual,modifiers});await command('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:virtual});}
  await wait('document.querySelector(".board-references").open','Record identities inaccessible by keyboard: '+await evaluate('document.activeElement.outerHTML'));
  await shot('detail-desktop');await clickButton('Kapat');
  if(!await evaluate('document.activeElement.matches(".board-task-title")'))throw Error('Focus not restored');
  for(const width of [1440,800,390]){await command('Emulation.setDeviceMetricsOverride',{width,height:800,deviceScaleFactor:1,mobile:false});await evaluate('window.scrollTo(0,0)');await sleep(100);if(await evaluate('document.documentElement.scrollWidth>innerWidth+1'))throw Error('Page overflow '+width);await shot('board-'+width);await click(selector);if(await evaluate('(()=>{const r=document.querySelector(".board-detail").getBoundingClientRect();return r.top<0||r.bottom>innerHeight+1||r.right>innerWidth+1})()'))throw Error('Detail overflow '+width);await shot('detail-'+width);await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await wait('!document.querySelector(".modal-layer")','Escape failed');}
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  if(JSON.stringify((await api('/sprints/'+sprint.id)).items)!==before)throw Error('Read-only filtering/detail modified tasks');
  const viewer='qa.board.'+Date.now(),password='qa-board-viewer-password-123';await api('/admin/users',{username:viewer,password});
  await loginAs(viewer,password);await board(sprint.id);
  if(await evaluate('!!document.querySelector(".task-card select")'))throw Error('Viewer can edit active sprint');await click(selector);await wait('!!document.querySelector(".board-detail")','Viewer cannot open active detail');await clickButton('Kapat');
  await loginAs(process.env.SPRINTBOARD_USERNAME,process.env.SPRINTBOARD_PASSWORD);await board(sprint.id);
  // Task writes remain the established parent workflow, including Undone confirmation.
  const select='[data-task-id="'+task.id+'"] select';await setFieldValue(select,'doing');await wait('!!document.querySelector("[data-status=doing] [data-task-id='+task.id+']")','Status did not move');
  await setFieldValue(select,'undone');await wait('!!document.querySelector(".modal textarea")','Undone not immediate');await clickButton('Vazgeç');await wait('!document.querySelector(".modal-layer")','Cancel not immediate');
  if((await api('/sprints/'+sprint.id)).items.find(t=>t.id===task.id).status!=='doing')throw Error('Undone cancel mutated data');
  await setFieldValue(select,'undone');await setFieldValue('.modal textarea','QA ortam bekleniyor');await clickButton('Undone olarak kaydet');await wait('!document.querySelector(".modal-layer") && !!document.querySelector("[data-status=undone] [data-task-id='+task.id+']")','Undone save failed');
  await click(selector);if(!await evaluate('document.querySelector(".board-detail").innerText.includes("QA ortam bekleniyor")'))throw Error('Undone note absent');
  await board('legacy-sprint-13');if(await evaluate('!!document.querySelector(".modal-layer") || !!document.querySelector(".task-card select")'))throw Error('Historical sprint leaked edit/detail');
  await setFieldValue('[name=boardQuery]','qa-no-match');await board(sprint.id);if(await evaluate('document.querySelector("[name=boardQuery]").value')!=='')throw Error('Filter leaked between sprints');
  // Freeze the disposable sprint, then verify the board still uses its snapshot.
  const preview=await api('/sprints/'+sprint.id+'/closure-preview');await api('/sprints/'+sprint.id+'/complete',{confirmed:true,fingerprint:preview.fingerprint,carryTaskIds:[]});
  await navigate('overview','TOPLAM SPRİNT');await board(sprint.id);
  if(!await evaluate('document.querySelector(".board-source").innerText.includes("sabit kayıt") && !document.querySelector(".task-card select")'))throw Error('Frozen board not read only');
  await click(selector);if(!await evaluate('document.querySelector(".board-detail").innerText.includes("Kapanışta sabitlenen")'))throw Error('Snapshot provenance absent');await clickButton('Kapat');
  await loginAs(viewer,password);await board(sprint.id);
  if(await evaluate('!!document.querySelector(".task-card select")'))throw Error('Viewer can edit');await click(selector);await wait('!!document.querySelector(".board-detail")','Viewer cannot view detail');await clickButton('Kapat');
  if(events.length)throw Error('Browser errors: '+events.join(' | '));
  console.log('Board UI: filters/counters/reset, detail/focus/Escape, 1440/800/390, no read mutation, status/Undone, sprint isolation, historical/frozen and viewer checks passed.');
};
