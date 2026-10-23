const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async({evaluate,command,navigate,clickButton,setFieldValue,sleep,events})=>{
 async function wait(expr){for(let i=0;i<100;i++){if(await evaluate(expr))return;await sleep(100);}throw Error('Timeout '+expr+' '+await evaluate('document.body.innerText.slice(-2000)'));}
 async function api(url,body){
   return JSON.parse(await evaluate(`(async()=>{const s=await(await fetch('/api/auth/session')).json();const r=await fetch('/api'+${JSON.stringify(url)},{method:${JSON.stringify(body?'POST':'GET')},headers:{'Content-Type':'application/json','X-CSRF-TOKEN':s.csrfToken},${body?'body:JSON.stringify('+JSON.stringify(body)+'),':''}});const text=await r.text();if(!r.ok)throw Error(r.status+' '+text);return text||'{}';})()`));
 }
 const sprint=(await api('/sprints')).find(s=>s.status==='active');assert(sprint);
 const custom=await api('/sprints/'+sprint.id+'/tasks/new',{title:'QA custom BAU '+Date.now(),taskCategory:'BAU',taskSubtype:'OTHER_BAU',size:'SMALL',estimatedHours:8,criteria:'Operations',reason:'QA BAU',readinessAcknowledged:true,assignments:[]});
 let current=await api('/sprints/'+sprint.id);
 const bau=current.items.filter(t=>t.taskCategory==='BAU');
 assert(bau.length>=4);assert(bau.some(t=>t.status!=='done'),'Exercise derived status before closing');
 const capacity=await api('/sprints/'+sprint.id+'/capacity');
 fs.mkdirSync('tmp/bau-ui',{recursive:true});
 await navigate('sprints/'+sprint.id+'/board','İşlerin durumu');
 await wait('!!document.querySelector(".board-bau-list article")');
 assert.equal(await evaluate('document.querySelectorAll(".board-bau-list article").length'),bau.length);
 assert(await evaluate('document.querySelectorAll(".board-bau select,.board-bau .board-card-actions").length===0'));
 for(const t of bau)assert(await evaluate(`!document.querySelector('.board [data-task-id="${t.id}"]')`));
 assert(await evaluate('[...document.querySelectorAll(".board-card-actions button")].some(b=>b.innerText==="Backlog’a geri gönder")'));
 for(const width of [1440,390]){
   await command('Emulation.setDeviceMetricsOverride',{width,height:950,deviceScaleFactor:1,mobile:false});
   await evaluate('document.querySelector(".board-bau").scrollIntoView({block:"start"})');await sleep(150);
   assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
   fs.writeFileSync('tmp/bau-ui/board-'+width+'.png',Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'));
 }
 await command('Emulation.clearDeviceMetricsOverride',{});
 await navigate('sprints/'+sprint.id+'/review','Sprintin şu anki fotoğrafı');
 await wait('!!document.querySelector(".review-type-progress")');
 const categoryText=await evaluate('[...document.querySelectorAll(".review-type-progress")].find(e=>e.innerText.includes("BAU")).innerText');
 assert(categoryText.includes(bau.length+' / '+bau.length+' Done'));
 await evaluate('window.__exports=[];const original=URL.createObjectURL;URL.createObjectURL=b=>{b.text().then(t=>window.__exports.push(t));return original(b)};HTMLAnchorElement.prototype.click=function(){}');
 await clickButton('Sprint özeti HTML indir');await wait('window.__exports.length===1');
 const html=await evaluate('window.__exports[0]');assert(html.includes('BAU her zaman otomatik Done'));
 assert(html.includes(custom.name||'QA custom BAU'));
 fs.writeFileSync('tmp/bau-ui/review.html',html);
 await clickButton('Sprinti tamamla');
 await wait('document.querySelector("app-sprint-close-dialog")?.innerText.includes("BAU · otomatik Done")');
 for(const t of bau)assert(await evaluate(`!document.querySelector('app-sprint-close-dialog [data-task-id="${t.id}"] input')`));
 await clickButton('Vazgeç');
 assert.equal((await api('/sprints/'+sprint.id)).status,'active');
 const preview=await api('/sprints/'+sprint.id+'/closure-preview');
 assert(preview.tasks.filter(t=>t.bau).every(t=>t.outcome==='done'&&!t.defaultCarry));
 await api('/sprints/'+sprint.id+'/complete',{confirmed:true,fingerprint:preview.fingerprint,carryTaskIds:[]});
 current=await api('/sprints/'+sprint.id);
 assert(current.closureFrozen);assert(current.items.filter(t=>t.taskCategory==='BAU').every(t=>t.status==='done'));
 assert.deepEqual(await api('/sprints/'+sprint.id+'/capacity'),capacity);
 assert.equal(events.length,0,events.join('\n'));
 console.log('BAU UI PASS: separate board, no status/block controls, direct backlog action, 1440/390px, active Review charts/filter/HTML, closure preview/cancel, custom BAU Done, capacity unchanged. QA database only.');
};
