const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async({evaluate,command,navigate,clickButton,setFieldValue,sleep,events})=>{
 async function wait(expr){for(let i=0;i<100;i++){if(await evaluate(expr))return;await sleep(100);}throw Error('Timeout '+expr+' '+await evaluate('document.body.innerText.slice(-1500)'));}
 async function api(url,body,method='POST'){return JSON.parse(await evaluate(`(async()=>{const s=await(await fetch('/api/auth/session')).json();const r=await fetch('/api'+${JSON.stringify(url)},{method:${JSON.stringify(body?method:'GET')},headers:{'Content-Type':'application/json','X-CSRF-TOKEN':s.csrfToken},${body?'body:JSON.stringify('+JSON.stringify(body)+'),':''}});const text=await r.text();if(!r.ok)throw Error(r.status+' '+text);return text||'{}';})()`));}
 async function click(selector){const p=JSON.parse(await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2});})()`));await command('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await command('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});}
 const s=(await api('/sprints')).find(s=>s.status==='active'),prefix='QA History '+Date.now();
 const create=title=>api('/sprints/'+s.id+'/tasks/new',{title,taskCategory:'DEV',size:'SMALL',estimatedHours:8,criteria:'QA',reason:'QA plan',readinessAcknowledged:true,assignments:[]});
 const task=await create(prefix);
 await api('/tasks/'+task.id,{status:'undone',note:'Doğrulama yetişmedi <img src=x onerror=alert(1)>'},'PATCH');
 const child=await api('/backlog/'+task.backlogId+'/repeat',{});
 const unrelated=await create(prefix);
 await api('/tasks/'+unrelated.id,{status:'done'},'PATCH');
 const returned=await create(prefix+' return');
 const detail=await api('/sprints/'+s.id),row=detail.items.find(t=>t.id===returned.id);
 await api('/tasks/'+returned.id+'/remove',{confirmed:true,fingerprint:row.flowFingerprint,reason:'Acil işe yer açıldı'});
 await navigate('backlog','İş listesi');
 await setFieldValue('input[type=search]',prefix);
 const selector='select[aria-label="Backlog görünümü"]';
 assert.deepEqual(JSON.parse(await evaluate('JSON.stringify([...document.querySelector('+JSON.stringify(selector)+').options].map(o=>o.text))')),['Havuz + sprint','Yalnız havuz','Sprintte','Tüm işler','Done işler']);
 for(const [view,count]of [['open',3],['Ready',2],['IN_SPRINT',1],['all',4],['Done',1]]){
   await setFieldValue(selector,view);await wait('document.querySelectorAll("[data-backlog-id]").length==='+count);
 }
 await setFieldValue(selector,'all');
 await click('[data-backlog-id="'+child.id+'"] .backlog-title-link');
 await wait('document.querySelectorAll(".history-record").length===2');
 assert(await evaluate('document.querySelector("app-backlog-history").innerText.includes("Doğrulama yetişmedi")'));
 assert(await evaluate('document.querySelector("app-backlog-history").innerText.includes("Havuzda")'));
 assert(!await evaluate('!!document.querySelector("app-backlog-history img")'));
 await click('app-backlog-history summary');
 await wait('document.querySelector("app-backlog-history").innerText.includes("Durum değişikliği")');
 fs.mkdirSync('tmp/backlog-history-ui',{recursive:true});
 for(const width of [1440,390]){
   await command('Emulation.setDeviceMetricsOverride',{width,height:950,deviceScaleFactor:1,mobile:false});
   await evaluate('document.querySelector("app-backlog-history").scrollIntoView({block:"start"})');
   assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
   assert(await evaluate('document.querySelector(".modal").scrollWidth<=document.querySelector(".modal").clientWidth+1'));
   fs.writeFileSync('tmp/backlog-history-ui/history-'+width+'.png',Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'));
 }
 await clickButton('Kapat');await wait('!document.querySelector(".modal")');
 await command('Emulation.clearDeviceMetricsOverride',{});
 await click('[data-backlog-id="'+returned.backlogId+'"] .backlog-title-link');
 await wait('document.querySelector("app-backlog-history")?.innerText.includes("Backlog’a geri döndü")');
 await click('app-backlog-history summary');
 assert(await evaluate('document.querySelector("app-backlog-history").innerText.includes("Acil işe yer açıldı")'));
 await clickButton('Kapat');assert.equal(events.length,0,events.join('\n'));
 console.log('Backlog history UI PASS: five filters, continuation chain, independent same-title records, escaped notes, journal, removed attempt, desktop/mobile, modal close.');
};
