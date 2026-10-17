const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async({evaluate,command,navigate,clickButton,setFieldValue,sleep,events})=>{
 async function api(path,body,method='POST'){return JSON.parse(await evaluate(`(async()=>{const s=await(await fetch('/api/auth/session')).json();const r=await fetch('/api'+${JSON.stringify(path)},{method:${JSON.stringify(body===undefined?'GET':method)},headers:{'Content-Type':'application/json','X-CSRF-TOKEN':s.csrfToken},${body===undefined?'':'body:JSON.stringify('+JSON.stringify(body)+'),'}});if(!r.ok)throw Error(r.status+' '+await r.text());return JSON.stringify(await r.json())})()`));}
 async function waitFor(e){for(let i=0;i<90;i++){if(await evaluate(e))return;await sleep(100);}throw Error('Timeout '+e);}
 const cap=await api('/sprints/legacy-sprint-14/capacity');
 const member=await api('/team',{name:'Participation QA',joinedOn:'2026-01-01',engagement:'CORE',teamRole:'DEVELOPER'});
 const before=await api('/export');
 await navigate('team','Takım ve roller');await setFieldValue('input[type=search]','Participation QA');await waitFor('document.querySelectorAll(".member-profile").length===1');
 await clickButton('Katılım geçmişi · 1 dönem');await waitFor('!!document.querySelector("[name=closed0]")');
 await evaluate('document.querySelector("[name=closed0]").click()');await setFieldValue('[name=left0]','2026-11-02');
 await clickButton('+ Yeniden katılım dönemi');await waitFor('!!document.querySelector("[name=joined1]")');await setFieldValue('[name=joined1]','2026-11-05');
 await clickButton('Katılım geçmişini kaydet');await waitFor('document.querySelector("app-member-participation").textContent.includes("Katılım geçmişi kaydedildi.")');
 const policy=await api('/team/'+member.id+'/participation');assert.equal(policy.periods.length,2);assert.equal(policy.periods[0].leftOn,'2026-11-02');
 const after=await api('/export');for(const table of Object.keys(before.tables))if(table!=='member_participation')assert.deepEqual(after.tables[table],before.tables[table],table);
 // Compare historical members only: creating a new person predates this change's protected scope.
 const now=await api('/sprints/legacy-sprint-14/capacity');assert.deepEqual(now.filter(r=>r.memberId!==member.id),cap);
 fs.mkdirSync('tmp/participation-20261008',{recursive:true});
 for(const width of [1440,390]){await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await sleep(200);assert(await evaluate('(()=>{const r=document.querySelector(".modal").getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight+1&&document.documentElement.scrollWidth<=innerWidth+1})()'));const shot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync('tmp/participation-20261008/member-'+width+'.png',Buffer.from(shot.data,'base64'));}
 await clickButton('Vazgeç');await waitFor('!document.querySelector(".modal-layer")');await clickButton('Katılım geçmişi · 2 dönem');await waitFor('document.querySelector("[name=joined1]")?.value==="2026-11-05"');
 await setFieldValue('[name=joined1]','2026-11-02');await clickButton('Katılım geçmişini kaydet');await waitFor('document.querySelector("[role=alert]")?.textContent.includes("çakışamaz")');assert.deepEqual((await api('/team/'+member.id+'/participation')).periods,policy.periods);
 await clickButton('Vazgeç');await waitFor('!document.querySelector(".modal-layer")');assert.deepEqual((await api('/team/'+member.id+'/participation')).periods,policy.periods);
 const sprint=await api('/sprints',{name:'Participation QA',start:'2026-11-02',end:'2026-11-06'});
 const rows=await api('/sprints/'+sprint.id+'/capacity');assert.equal(rows.find(r=>r.memberId===member.id).workingDays,3);
 await api('/team/'+member.id+'/participation',{version:policy.version,periods:[{joinedOn:'2026-01-01',leftOn:'2026-02-01',closed:true}]},'PUT');
 assert.deepEqual(await api('/sprints/'+sprint.id+'/capacity'),rows);
 const unexpected=events.filter(e=>!e.includes('400 http://127.0.0.1:4183/api/team/'+member.id+'/participation')&&!e.includes('400 (Bad Request)')&&!e.includes('status of 400 ()'));assert.equal(unexpected.length,0,unexpected.join('\n'));console.log('Participation UI PASS: inclusive dates, join/depart/rejoin, overlap rejection, save/reopen/cancel, frozen sprint, mobile modal bounds.');
};
