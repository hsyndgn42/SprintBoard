const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async({evaluate,command,navigate,clickButton,setFieldValue,sleep,events})=>{
 async function api(path,body,method='POST'){return JSON.parse(await evaluate(`(async()=>{const s=await(await fetch('/api/auth/session')).json();const r=await fetch('/api'+${JSON.stringify(path)},{method:${JSON.stringify(body===undefined?'GET':method)},headers:{'Content-Type':'application/json','X-CSRF-TOKEN':s.csrfToken},${body===undefined?'':'body:JSON.stringify('+JSON.stringify(body)+'),'}});if(!r.ok)throw Error(r.status+' '+await r.text());return JSON.stringify(await r.json())})()`));}
 async function waitFor(e){for(let i=0;i<100;i++){if(await evaluate(e))return;await sleep(100);}throw Error('Timeout '+e);}
 const before=await api('/export'),oldCapacity=await api('/sprints/legacy-sprint-14/capacity');
 await navigate('settings','Çalışma varsayılanları');await waitFor('!!document.querySelector("[name=workHours]")');
 const current=await api('/settings');let date=new Date(current.today+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+30);while(date.getUTCDay()!==1)date.setUTCDate(date.getUTCDate()+1);const start=date.toISOString().slice(0,10);date.setUTCDate(date.getUTCDate()+6);const end=date.toISOString().slice(0,10);
 await setFieldValue('[name=teamName]','Takvim QA');await setFieldValue('[name=workHours]','7.5');await setFieldValue('[name=workFrom]',start);
 await evaluate('document.querySelectorAll(".week-options input")[4].click();document.querySelectorAll(".week-options input")[5].click()');
 await clickButton('Çalışma düzenini kaydet');await waitFor('document.querySelector("app-work-settings").textContent.includes("Kaydedildi.")');
 assert(await evaluate('document.querySelector(".topbar-title").textContent.includes("Takvim QA")'));
 let settings=await api('/settings');assert.equal(settings.teamName,'Takvim QA');assert.equal(settings.hoursPerDay,8);assert.deepEqual(settings.workSchedules.at(-1),{effectiveFrom:start,hoursPerDay:7.5,workingDays:[1,2,3,4,6]});
 const after=await api('/export');for(const table of Object.keys(before.tables))if(table!=='product_setting')assert.deepEqual(after.tables[table],before.tables[table],table);assert.deepEqual(await api('/sprints/legacy-sprint-14/capacity'),oldCapacity);
 await command('Page.reload',{ignoreCache:true});await waitFor('document.querySelector("app-work-settings")?.textContent.includes("7.5 saat/gün")');
 await setFieldValue('[name=teamName]','Do not save');await clickButton('Vazgeç');await waitFor('document.querySelector("[name=teamName]").value==="Takvim QA"');
 const sprint=await api('/sprints',{name:'QA çalışma düzeni',start,end});let detail=await api('/sprints/'+sprint.id);assert.equal(detail.workSettings.hoursPerDay,7.5);const assigned=detail.items.find(t=>t.workKind==='MEETING').assignments;assert(assigned.length>0);assert(assigned.every(a=>a.estimatedHours===15));
 await api('/settings/work-schedule',{teamName:'Takvim QA',effectiveFrom:start,hoursPerDay:6,workingDays:[1,2,3]},'PUT');assert.equal((await api('/sprints/'+sprint.id)).workSettings.hoursPerDay,7.5);
 fs.mkdirSync('tmp/work-settings-20261008',{recursive:true});
 for(const width of [1440,390]){await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await evaluate('document.querySelector("app-work-settings").scrollIntoView({block:"start"});window.scrollBy(0,-85)');await sleep(200);assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));const shot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync('tmp/work-settings-20261008/settings-'+width+'.png',Buffer.from(shot.data,'base64'));}
 assert.equal(events.length,0,events.join('\n'));console.log('Work settings UI PASS: future policy, team label, reload/cancel, preserved calendar/history, new BAU 15h, immutable sprint policy, 1440/390px.');
};
