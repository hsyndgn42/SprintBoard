const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async({evaluate,command,navigate,clickButton,setFieldValue,sleep,events})=>{
 async function api(path,body,method='POST'){return JSON.parse(await evaluate(`(async()=>{const s=await(await fetch('/api/auth/session')).json();const r=await fetch('/api'+${JSON.stringify(path)},{method:${JSON.stringify(body===undefined?'GET':method)},headers:{'Content-Type':'application/json','X-CSRF-TOKEN':s.csrfToken},${body===undefined?'':'body:JSON.stringify('+JSON.stringify(body)+'),'}});if(!r.ok)throw Error(r.status+' '+await r.text());return JSON.stringify(await r.json())})()`));}
 async function waitFor(e){for(let i=0;i<100;i++){if(await evaluate(e))return;await sleep(100);}throw Error('Timeout '+e);}
 const core=await api('/team',{name:'Planning QA Core',joinedOn:'2026-01-01',teamRole:'DEVELOPER',engagement:'CORE'});
 const support=await api('/team',{name:'Planning QA Support',joinedOn:'2026-01-01',teamRole:'DESIGNER',engagement:'SUPPORT'});
 const sprint=await api('/sprints',{name:'Planning checks QA',start:'2026-11-02',end:'2026-11-06'});
 const initial=await api('/sprints/'+sprint.id),task=initial.items.find(t=>t.workKind==='MEETING');
 await api('/tasks/'+task.id+'/assignments',{assignments:[{memberId:core.id,estimatedHours:12,supportOnly:false},{memberId:support.id,estimatedHours:8,supportOnly:false}]},'PUT');
 const before=await api('/export');
 await navigate('sprints/'+sprint.id+'/planning','İşler ve atamalar');await waitFor('document.querySelector("app-planning-insights")?.textContent.includes("1 kişi kontrol bekliyor")');
 await evaluate('document.querySelector(".people-details summary").click()');await waitFor('document.querySelector(".people-body")?.textContent.includes("Support için ayrılan gün girilmemiş")');
 assert(!(await evaluate('document.querySelector("app-planning-insights").textContent')).includes('Teslimat tahmini:'));
 await evaluate(`(()=>{const row=[...document.querySelectorAll(".planning-table tbody tr")].find(r=>r.textContent.includes(${JSON.stringify(task.name)}));[...row.querySelectorAll("button")].find(b=>b.textContent==="Atama düzenle").click();})()`);
 await waitFor('!!document.querySelector(".assignment-modal")');await setFieldValue('[aria-label="Planning QA Core tahmini saat"]','99');
 await waitFor('document.querySelector(".assignment-modal app-planning-insights")?.textContent.includes("Kapasite aşılıyor")');
 await evaluate('(()=>{const s=document.querySelector("[aria-label=\\\"Planning QA Core atama türü\\\"]");s.value="support";s.dispatchEvent(new Event("change",{bubbles:true}));})()');
 await waitFor('document.querySelector(".assignment-modal app-planning-insights")?.textContent.includes("16 / 40 sa")');
 await evaluate('(()=>{const s=document.querySelector("[aria-label=\\\"Planning QA Core atama türü\\\"]");s.value="hours";s.dispatchEvent(new Event("change",{bubbles:true}));})()');
 await waitFor('document.querySelector(".assignment-modal app-planning-insights")?.textContent.includes("115 / 40 sa")');
 const text=await evaluate('document.querySelector(".assignment-modal app-planning-insights").textContent');assert(text.includes('115 / 40 sa'),text);
 fs.mkdirSync('tmp/planning-insights-20261008',{recursive:true});
 for(const width of [1440,390]){await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await sleep(150);await evaluate('document.querySelector(".assignment-modal app-planning-insights").scrollIntoView({block:"center"})');assert(await evaluate('(()=>{const r=document.querySelector(".modal").getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight+1&&document.documentElement.scrollWidth<=innerWidth+1})()'));const shot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync('tmp/planning-insights-20261008/draft-'+width+'.png',Buffer.from(shot.data,'base64'));}
 await clickButton('Vazgeç');await waitFor('!document.querySelector(".modal-layer")');assert.deepEqual((await api('/export')).tables,before.tables);
 await command('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 await evaluate(`(()=>{const row=[...document.querySelectorAll(".planning-table tbody tr")].find(r=>r.textContent.includes(${JSON.stringify(task.name)}));[...row.querySelectorAll("button")].find(b=>b.textContent==="Atama düzenle").click();})()`);await waitFor('!!document.querySelector(".assignment-modal")');
 await setFieldValue('[aria-label="Planning QA Core tahmini saat"]','99');await clickButton('Atamaları kaydet');await waitFor('!document.querySelector(".modal-layer")');await waitFor('document.querySelector("app-planning-insights")?.textContent.includes("2 kişi kontrol bekliyor")');
 assert.equal((await api('/sprints/'+sprint.id+'/capacity')).find(r=>r.memberId===core.id).plannedHours,115);
 await evaluate('document.querySelector(".people-details summary").click()');
 for(const width of [1440,390]){await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await evaluate('document.querySelector("app-planning-insights").scrollIntoView({block:"start"})');await sleep(120);assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));const shot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync('tmp/planning-insights-20261008/plan-'+width+'.png',Buffer.from(shot.data,'base64'));}
 await navigate('sprints/'+sprint.id+'/capacity','Planlanan yük / kullanılabilir saat');await waitFor('document.querySelector("app-planning-insights")?.textContent.includes("2 kişi kontrol bekliyor")');
 await navigate('sprints/legacy-sprint-01/planning','İşler ve atamalar');await waitFor('document.querySelector("app-planning-insights")?.textContent.includes("Tarihsel plan kontrolü")');assert.equal(await evaluate('document.querySelector("app-planning-insights").querySelectorAll("button").length===0'),true);
 assert.equal(events.length,0,events.join('\n'));console.log('Planning insights UI PASS: Support warning, non-blocking overload save, immediate draft preview, cancel preserves data, refreshed summary/capacity, historical readonly and desktop/mobile.');
};
