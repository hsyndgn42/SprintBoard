const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async({evaluate,command,navigate,clickButton,setFieldValue,sleep,events})=>{
 async function api(path,body,method='POST'){return JSON.parse(await evaluate(`(async()=>{const s=await(await fetch('/api/auth/session')).json();const r=await fetch('/api'+${JSON.stringify(path)},{method:${JSON.stringify(body===undefined?'GET':method)},headers:{'Content-Type':'application/json','X-CSRF-TOKEN':s.csrfToken},${body===undefined?'':'body:JSON.stringify('+JSON.stringify(body)+'),'}});if(!r.ok)throw Error(r.status+' '+await r.text());return JSON.stringify(await r.json())})()`));}
 async function waitFor(e){for(let i=0;i<90;i++){if(await evaluate(e))return;await sleep(100);}throw Error('Timeout '+e);}
 const before=await api('/export'),cap=await api('/sprints/legacy-sprint-14/capacity');
 await navigate('team','Takım ve roller');await waitFor('document.querySelectorAll(".member-profile").length>0');
 const person=await evaluate('document.querySelector(".member-profile-head strong").textContent');const member=(await api('/team')).find(m=>m.name===person);
 await clickButton('Kapasite ayarları');await waitFor('!!document.querySelector("[name=personHoursMode]")');
 await evaluate('(()=>{const s=document.querySelector("[name=personHoursMode]");s.value=s.options[1].value;s.dispatchEvent(new Event("change",{bubbles:true}));})()');
 await waitFor('!!document.querySelector("[name=personHours]")');await setFieldValue('[name=personHours]','6');await setFieldValue('[name=personFocus]','80');
 await clickButton('Kapasite ayarını kaydet');await waitFor('document.querySelector("app-member-capacity").textContent.includes("Kaydedildi.")');
 let policy=await api('/team/'+member.id+'/capacity-policy');assert.equal(policy.history[0].hoursPerDay,6);assert.equal(policy.history[0].focusPercent,80);
 const after=await api('/export');for(const table of Object.keys(before.tables))if(table!=='member_capacity_policy')assert.deepEqual(after.tables[table],before.tables[table],table);assert.deepEqual(await api('/sprints/legacy-sprint-14/capacity'),cap);
 await clickButton('Vazgeç');await waitFor('!document.querySelector(".modal-layer")');await clickButton('Kapasite ayarları');await waitFor('document.querySelector("[name=personHours]")?.value==="6"');
 fs.mkdirSync('tmp/member-capacity-20261008',{recursive:true});
 for(const width of [1440,390]){await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await sleep(200);assert(await evaluate('(()=>{const r=document.querySelector(".modal").getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight+1&&document.documentElement.scrollWidth<=innerWidth+1})()'));const shot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync('tmp/member-capacity-20261008/member-'+width+'.png',Buffer.from(shot.data,'base64'));}
 await setFieldValue('[name=personFocus]','45');await clickButton('Vazgeç');await waitFor('!document.querySelector(".modal-layer")');assert.equal((await api('/team/'+member.id+'/capacity-policy')).history[0].focusPercent,80);
 let startDate=new Date(policy.today+'T12:00:00Z');startDate.setUTCDate(startDate.getUTCDate()+30);while(startDate.getUTCDay()!==1)startDate.setUTCDate(startDate.getUTCDate()+1);const start=startDate.toISOString().slice(0,10);startDate.setUTCDate(startDate.getUTCDate()+4);const sprint=await api('/sprints',{name:'Person policy QA',start,end:startDate.toISOString().slice(0,10)});
 const rows=await api('/sprints/'+sprint.id+'/capacity'),row=rows.find(r=>r.memberId===member.id);assert.equal(row.hoursPerDay,6);assert.equal(row.focusPercent,80);assert.equal(row.availableHours,24);
 await api('/team/'+member.id+'/capacity-policy',{effectiveFrom:policy.today,hoursPerDay:4,focusPercent:40},'PUT');assert.deepEqual(await api('/sprints/'+sprint.id+'/capacity'),rows);
 assert.equal(events.length,0,events.join('\n'));console.log('Member capacity UI PASS: save/reopen/cancel, personal policy, immutable existing/new sprint, preserved calendar/data, mobile modal bounds.');
};
