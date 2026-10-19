const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async({evaluate,command,navigate,clickButton,setFieldValue,sleep,events})=>{
 async function waitFor(expression){for(let i=0;i<100;i++){if(await evaluate(expression))return;await sleep(100);}throw Error('Timeout: '+expression);}
 async function api(path,body,method=body===undefined?'GET':'POST'){return JSON.parse(await evaluate(`(async()=>{const s=await fetch('/api/auth/session').then(r=>r.json());const r=await fetch('/api'+${JSON.stringify(path)},{method:${JSON.stringify(method)},headers:{'Content-Type':'application/json','X-CSRF-TOKEN':s.csrfToken},${body===undefined?'':'body:JSON.stringify('+JSON.stringify(body)+'),'}});if(!r.ok)throw Error(r.status+' '+await r.text());return JSON.stringify(await r.json())})()`));}
 async function shot(name){fs.mkdirSync('tmp/sprint-edit-ui',{recursive:true});const s=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync('tmp/sprint-edit-ui/'+name+'.png',Buffer.from(s.data,'base64'));}
 async function disclosures(selector){
  const count=await evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`);assert(count>0,selector);
  assert.equal(Number(await evaluate(`[...document.querySelectorAll(${JSON.stringify(selector)})].filter(d=>d.open).length`)),0,'Initially collapsed '+selector);
  await evaluate(`document.querySelector(${JSON.stringify(selector+' > summary')}).focus()`);
  const focused=await evaluate('document.activeElement?.tagName');assert.equal(focused,'SUMMARY','Disclosure focus: '+await evaluate('document.activeElement?.outerHTML'));
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',windowsVirtualKeyCode:13});await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  try{await waitFor(`document.querySelector(${JSON.stringify(selector)}).open`);}catch(e){await shot('toggle-failure');console.log(await evaluate(`document.querySelector(${JSON.stringify(selector)}).outerHTML.slice(0,1800)`));throw e;}
  await evaluate(`[...document.querySelectorAll(${JSON.stringify(selector)})].forEach(d=>{if(!d.open)d.querySelector(':scope > summary').click()})`);
  assert.equal(await evaluate(`[...document.querySelectorAll(${JSON.stringify(selector)})].filter(d=>d.open).length`),count);
 }
 const member=await api('/team',{name:'UI Test Developer',title:'Developer',role:'Member',teamRole:'DEVELOPER',engagement:'CORE',joinedOn:'2026-01-01'});
 await navigate('sprints','Sprintler');await clickButton('+ Yeni sprint');
 assert(await evaluate('document.querySelector(".modal").innerText.includes("Hedef (isteğe bağlı)")'));
 await setFieldValue('[name=name]','Düzenleme QA');await setFieldValue('[name=start]','2026-10-05');await setFieldValue('[name=end]','2026-10-26');await clickButton('Sprint oluştur');
 await waitFor('!document.querySelector(".modal")');const sprint=(await api('/sprints')).find(s=>s.name==='Düzenleme QA');assert(sprint);assert.equal(sprint.goal,'');
 await navigate('sprints/'+sprint.id+'/summary','Düzenleme QA');await clickButton('Sprinti düzenle');await waitFor('!!document.querySelector("[name=editName]")');
 await setFieldValue('[name=editName]','Yanlış taslak');await clickButton('Vazgeç');assert.equal((await api('/sprints/'+sprint.id)).name,'Düzenleme QA');
 await clickButton('Sprinti düzenle');await waitFor('!!document.querySelector("[name=editName]")');await setFieldValue('[name=editName]','Düzeltilmiş sprint');await setFieldValue('[name=editGoal]','Sonradan belirlenen hedef');await setFieldValue('[name=editStart]','2026-10-06');await clickButton('Değişiklikleri kaydet');
 await waitFor('!document.querySelector(".modal")');await waitFor('document.querySelector("h1")?.textContent==="Düzeltilmiş sprint"');
 let updated=await api('/sprints/'+sprint.id);assert.equal(updated.start,'2026-10-06');assert.equal(updated.goal,'Sonradan belirlenen hedef');
 assert.equal((await api('/sprints/'+sprint.id+'/capacity')).find(r=>r.memberId===member.id).workingDays,15);
 const task=await api('/sprints/'+sprint.id+'/tasks/new',{title:'UI delivery task',criteria:'Test acceptance',taskCategory:'DEV',workKind:'DEVELOPMENT',type:'TASK',estimatedHours:8,size:'SMALL',readinessAcknowledged:true,assignments:[{memberId:member.id,estimatedHours:8,supportOnly:false}]});
 await api('/sprints/'+sprint.id+'/start',{});await api('/self/tasks/'+task.id+'/notes',{date:'2026-10-16',message:'Günlük görünürlük testi'});
 const reserve=await api('/sprints/'+sprint.id+'/tasks/new',{title:'UI Defect Support',taskCategory:'BAU',taskSubtype:'DEFECT_SUPPORT',size:'SMALL',estimatedHours:0,readinessAcknowledged:true,reason:'QA',assignments:[{memberId:member.id,estimatedHours:8,supportOnly:false}]});
 const defect=await api('/sprints/'+sprint.id+'/tasks/new',{title:'UI one-hour defect',taskCategory:'DEFECT',taskSubtype:'TEST_DEFECT',size:'SMALL',estimatedHours:0,readinessAcknowledged:true,reason:'QA',reserveTaskId:reserve.id,assignments:[{memberId:member.id,estimatedHours:1,supportOnly:false}]});
 await navigate('sprints/'+sprint.id+'/planning','İşler ve atamalar');await waitFor('!!document.querySelector("app-planning-insights details")');
 await waitFor(`!!document.querySelector('[data-planning-task="${defect.id}"]')`);
 await disclosures('details.planning-group');await disclosures('app-planning-insights details[appFold]');
 const defectCell=await evaluate(`document.querySelector('[data-planning-task="${defect.id}"] td:nth-child(3)').innerText`);
 assert.match(defectCell,/^1 sa/);assert.match(defectCell,/Rezervden karşılanan: 1 sa/);assert.match(defectCell,/Ek plan yükü: 0 sa/);
 const reserveCell=await evaluate(`document.querySelector('[data-planning-task="${reserve.id}"] td:nth-child(3)').innerText`);assert.match(reserveCell,/^7 sa/);
 assert(await evaluate('document.querySelector(".planning-table").checkVisibility()'));await shot('planning');
 await navigate('sprints/'+sprint.id+'/effort','Görev × kişi görünümü');await disclosures('details.effort-group');await shot('effort');
 await navigate('sprints/'+sprint.id+'/journal','Sprint günlüğü');await waitFor('!!document.querySelector(".journal-day")');
 await disclosures('details.journal');await disclosures('details.journal-day');assert(await evaluate('document.querySelector(".journal-entry").checkVisibility()'));await shot('journal');
 await navigate('sprints/'+sprint.id+'/review','Sprintin şu anki fotoğrafı');await waitFor('!!document.querySelector(".external-support")');
 await waitFor('[...document.querySelectorAll("button")].some(b=>b.textContent==="Sprint özeti HTML indir"&&!b.disabled)');
 await disclosures('.review details[appFold]');
 await evaluate('document.querySelector(".task-results > summary").click()');
 const before=await evaluate('JSON.stringify([...document.querySelectorAll(".review details[appFold]")].map(d=>d.open))');
 await evaluate('window.dispatchEvent(new Event("beforeprint"))');assert(await evaluate('[...document.querySelectorAll(".review details[appFold]")].every(d=>d.open)'));
 await command('Emulation.setEmulatedMedia',{media:'print'});assert(await evaluate('document.querySelector(".result-row").checkVisibility()'));
 await command('Emulation.setEmulatedMedia',{media:''});await evaluate('window.dispatchEvent(new Event("afterprint"))');
 assert.equal(await evaluate('JSON.stringify([...document.querySelectorAll(".review details[appFold]")].map(d=>d.open))'),before);
 await evaluate('[...document.querySelectorAll(".review details[appFold]")].forEach(d=>d.open=false)');await shot('review-collapsed');
 for(const [route,heading,selector]of [['overtime','Fazla mesai','details[appFold]'],['leaves','Kişi izinleri','details[appFold]']]){
  await navigate(route,heading);await waitFor('document.querySelectorAll("details[appFold]").length>=2');await disclosures(selector);await shot(route);
 }
 for(const route of ['overtime','leaves',...['planning','effort','review','journal'].map(tab=>'sprints/'+sprint.id+'/'+tab)]){
  await navigate(route,route==='leaves'?'Kişi izinleri':route==='overtime'?'Fazla mesai':'Düzeltilmiş sprint');await sleep(250);
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});await sleep(100);
  assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Mobile overflow '+route);
  await evaluate('[...document.querySelectorAll("details[appFold]")].forEach(d=>d.open=true)');await sleep(100);
  assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Expanded mobile overflow '+route);
  if(route.endsWith('review'))await shot('review-mobile');
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 }
 await navigate('settings','Ayarlar');await waitFor('!!document.querySelector("app-slack-settings form")');
 const receiptStatus=await api('/admin/slack');assert.equal(receiptStatus.receiptPending,0);assert.equal(receiptStatus.receiptError,'');
 await evaluate('document.querySelector("app-slack-settings").closest("details").open=true');
 assert(await evaluate('document.querySelector("app-slack-settings").innerText.includes("reactions:write")'));
 assert(await evaluate('document.querySelector("app-slack-settings").innerText.includes("admin onayı veya işin tamamlanması değildir")'));
 if(process.env.SPRINTBOARD_SMOKE_SLACK_BACKLOG==='1')await require('./test-slack-backlog-ui.cjs')({evaluate,command,navigate,clickButton,setFieldValue,sleep,waitFor,shot,api});
 await require('./test-board-all-items-ui.cjs')({evaluate,navigate,clickButton,setFieldValue,waitFor,shot,api,sprint,member});
 if(process.env.SPRINTBOARD_SMOKE_SLACK_BACKLOG==='1')await require('./test-overtime-correction-ui.cjs')({evaluate,command,navigate,clickButton,setFieldValue,waitFor,shot,api,sprint,member,sleep,events});
 if(process.env.SPRINTBOARD_SMOKE_SLACK_BACKLOG==='1')await require('./test-slack-message-correction-ui.cjs')({evaluate,command,navigate,clickButton,setFieldValue,waitFor,shot,api,sleep});
 await require('./test-scope-views-ui.cjs')({evaluate,navigate,setFieldValue,api,waitFor,sprint,member,shot});
 if(process.env.SPRINTBOARD_SMOKE_AUTOMATION==='1')await require('./test-slack-automation-ui.cjs')({evaluate,command,navigate,clickButton,setFieldValue,api,waitFor,shot,sleep});
 if(process.env.SPRINTBOARD_SMOKE_UX==='1')await require('./test-ui-system.cjs')({evaluate,command,navigate,clickButton,setFieldValue,api,waitFor,sprint,shot,sleep});
 assert.equal(events.length,0,events.join('\n'));
 console.log('PASS: blank goal creation, edit/cancel/save, 15 inclusive working days, all requested disclosures, keyboard toggle, print expansion/restoration, export readiness, mobile closed/open, no browser errors.');
};
