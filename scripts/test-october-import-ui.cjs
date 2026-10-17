// Disposable 4183 only: restore the rehearsed data, then read-only UI verification.
const fs=require('node:fs'),assert=require('node:assert/strict');
module.exports=async({evaluate,command,navigate,setFieldValue,sleep,events})=>{
 const backup=JSON.parse(fs.readFileSync('tmp/october-import/rehearsal-final/after.json','utf8'));
 async function api(path,body){return JSON.parse(await evaluate(`(async()=>{const s=await(await fetch('/api/auth/session')).json();const r=await fetch('/api'+${JSON.stringify(path)},{method:${JSON.stringify(body===undefined?'GET':'POST')},headers:{'Content-Type':'application/json','X-CSRF-TOKEN':s.csrfToken},${body===undefined?'':'body:JSON.stringify('+JSON.stringify(body)+'),'}});if(!r.ok)throw Error(r.status+' '+await r.text());return JSON.stringify(await r.json())})()`));}
 const preview=await api('/admin/backups/preview',backup);
 await api('/admin/backups/restore',{backup,...preview,confirmation:'GERİ YÜKLE'});
 const sprints=await api('/sprints');assert.equal(sprints.length,16);assert.deepEqual(sprints.filter(s=>s.status==='active').map(s=>s.number),[16]);
 const pool=await api('/backlog');assert.equal(pool.filter(b=>!b.taskId).length,0);assert.equal(pool.length,432);
 const expected={14:[27,24,3],15:[41,33,8],16:[29,0,0]};
 for(const number of [14,15,16]){
  const id='legacy-sprint-'+number,s=await api('/sprints/'+id);
  assert.equal(s.items.length,expected[number][0]);assert.equal(s.items.filter(t=>t.status==='done').length,expected[number][1]);assert.equal(s.items.filter(t=>t.status==='undone').length,expected[number][2]);
  assert.equal(!!s.closureFrozen,number<16);
  if(number===16){assert.equal(s.items.filter(t=>t.status==='doing').length,3);assert.equal(s.flow.origin,'OBSERVED');assert.equal(s.flow.baseline.length,29);}
  await navigate('sprints/'+id+'/review','Review notları ve kararlar');
  await sleep(150);assert(await evaluate('document.querySelector("main").innerText.includes('+JSON.stringify('Sprint '+number)+')'));
  await navigate('sprints/'+id+'/capacity','Planlanan yük / kullanılabilir saat');
  await navigate('sprints/'+id+'/planning','');await sleep(150);
 }
 const leaves=await api('/leaves');
 for(const [s,m,d] of [[15,'akin',2],[15,'isa',1],[16,'umran',5],[16,'isa',1]])assert.equal(leaves.find(l=>l.sprintId==='legacy-sprint-'+s&&l.memberId==='legacy-member-'+m).days,d);
 const capacity=await api('/sprints/legacy-sprint-16/capacity');assert.equal(capacity.find(c=>c.memberId==='legacy-member-umran').availableHours,88); // PDF date range has 16 weekdays, not 15.
 assert.equal(capacity.find(c=>c.memberId==='legacy-member-burak').plannedHours,56);
 const overtime=await api('/overtime');
 assert.equal(overtime.find(o=>o.sprintNumber===16&&o.memberId==='legacy-member-isa').balanceHours,56);
 assert.equal(overtime.find(o=>o.sprintNumber===16&&o.memberId==='legacy-member-gorkem').balanceHours,71);
 assert.equal(overtime.filter(o=>o.memberId==='legacy-member-akin').sort((a,b)=>b.sprintNumber-a.sprintNumber)[0].balanceHours,42);
 for(const route of ['overview','reports','leaves','overtime','team','backlog']){await navigate(route,'');await sleep(120);}
 await navigate('backlog','İş listesi');await setFieldValue('.backlog-filters select','Ready');await sleep(200);assert(await evaluate('document.querySelector("main").innerText.includes("Bu filtrede iş bulunamadı")'));
 fs.mkdirSync('tmp/october-import/ui',{recursive:true});
 async function shot(name){const s=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync('tmp/october-import/ui/'+name+'.png',Buffer.from(s.data,'base64'));}
 await shot('empty-pool');
 await navigate('sprints/legacy-sprint-16/planning','');await sleep(200);await shot('sprint16-planning');
 await navigate('sprints/legacy-sprint-16/board','İşlerin durumu');await sleep(200);await shot('sprint16-board');
 await command('Emulation.setDeviceMetricsOverride',{width:390,height:780,deviceScaleFactor:1,mobile:false});await sleep(400);assert(!await evaluate('document.documentElement.scrollWidth>innerWidth+1'));await shot('sprint16-mobile');
 await navigate('sprints/legacy-sprint-15/review','Review notları ve kararlar');await sleep(150);assert(!await evaluate('document.documentElement.scrollWidth>innerWidth+1'));await shot('sprint15-mobile');
 assert.equal(events.length,0,'Browser errors');console.log('October import UI passed: 16 sprints, 14/15 frozen outcomes, active16, 432 linked tasks, empty pool, leaves, estimates/X, overtime balances, desktop/mobile.');
};
