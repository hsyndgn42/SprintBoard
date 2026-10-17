const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async({evaluate,command,navigate,clickButton,setFieldValue,sleep,events})=>{
 async function waitFor(e){for(let i=0;i<100;i++){if(await evaluate(e))return;await sleep(100);}throw Error('Timeout '+e);}
 async function api(path,body,method='POST'){return JSON.parse(await evaluate(`(async()=>{const s=await(await fetch('/api/auth/session')).json();const r=await fetch('/api'+${JSON.stringify(path)},{method:${JSON.stringify(body===undefined?'GET':method)},headers:{'Content-Type':'application/json','X-CSRF-TOKEN':s.csrfToken},${body===undefined?'':'body:JSON.stringify('+JSON.stringify(body)+'),'}});if(!r.ok)throw Error(r.status+' '+await r.text());return JSON.stringify(await r.json())})()`));}
 const s=(await api('/sprints')).find(s=>s.status==='active');
 const b=await api('/backlog',{title:'QA Pano eylemleri '+Date.now(),size:'SMALL',taskCategory:'DEV',estimatedHours:8});
 const readiness=(await api('/backlog/'+b.id+'/readiness')).readiness;
 const task=await api('/sprints/'+s.id+'/tasks',{backlogId:b.id,reason:'İzole pano testi',readinessAcknowledged:true,readinessFingerprint:readiness.fingerprint});
 const card='[data-task-id="'+task.id+'"]';
 await navigate('sprints/'+s.id+'/board','İşlerin durumu');await waitFor(`!!document.querySelector('${card}')`);
 assert(await evaluate('!document.querySelector(".board-assignees")'));
 await clickButton('Engel bildir',card+' button');
 await waitFor('!!document.querySelector("[name=flowReason]")');
 await setFieldValue('[name=flowReason]','Test ortamı bekleniyor');await clickButton('Kaydet');
 await waitFor(`!document.querySelector('.modal-layer')&&document.querySelector('${card} .blocker-label')?.textContent.includes('Test ortamı bekleniyor')`);
 let current=(await api('/sprints/'+s.id)).items.find(t=>t.id===task.id);
 assert.equal(current.status,'todo');assert.equal(current.blocker.blocked,true);
 assert(await evaluate(`[...document.querySelector('${card} select').options].filter(o=>['done','undone'].includes(o.value)).every(o=>o.disabled)`));
 await clickButton('Engeli kaldır',card+' button');await setFieldValue('[name=flowReason]','Ortam hazırlandı');await clickButton('Kaydet');
 await waitFor(`!document.querySelector('.modal-layer')&&!document.querySelector('${card} .blocker-label')`);
 current=(await api('/sprints/'+s.id)).items.find(t=>t.id===task.id);assert.equal(current.blocker.blocked,false);assert.equal(current.blocker.reason,'Ortam hazırlandı');
 await setFieldValue(card+' select','undone');await waitFor('!!document.querySelector("[name=undoneNote]")');
 assert(await evaluate('[...document.querySelectorAll(".modal button")].find(b=>b.textContent==="Undone olarak kaydet").disabled'));
 await clickButton('Vazgeç');await waitFor('!document.querySelector(".modal-layer")');
 assert.equal((await api('/sprints/'+s.id)).items.find(t=>t.id===task.id).status,'todo');
 await waitFor(`document.querySelector('${card} select').value==='todo'`);
 await setFieldValue(card+' select','undone');await setFieldValue('[name=undoneNote]','Kalan entegrasyon testi sonraki sprintte tamamlanacak.');
 await clickButton('Undone olarak kaydet');await waitFor(`!document.querySelector('.modal-layer')&&!!document.querySelector('[data-status=undone] ${card}')`);
 assert((await evaluate(`document.querySelector('${card} .board-note').innerText`)).includes('Kalan entegrasyon testi'));
 await clickButton('Açıklamayı düzenle',card+' button');assert.equal(await evaluate('document.querySelector("[name=undoneNote]").value'),'Kalan entegrasyon testi sonraki sprintte tamamlanacak.');
 await setFieldValue('[name=undoneNote]','QA açıklama güncellendi');await clickButton('Undone olarak kaydet');await waitFor('!document.querySelector(".modal-layer")');
 assert.equal((await api('/sprints/'+s.id)).items.find(t=>t.id===task.id).statusNote,'QA açıklama güncellendi');
 fs.mkdirSync('tmp/board-actions-ui',{recursive:true});
 for(const width of [1440,390]){
  await command('Emulation.setDeviceMetricsOverride',{width,height:950,deviceScaleFactor:1,mobile:false});await evaluate(`document.querySelector('${card}').scrollIntoView({block:'center'})`);await sleep(100);
  assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
  fs.writeFileSync('tmp/board-actions-ui/card-'+width+'.png',Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await clickButton('Açıklamayı düzenle',card+' button');await sleep(100);
  assert(await evaluate('(()=>{const r=document.querySelector(".modal").getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight+1})()'));
  fs.writeFileSync('tmp/board-actions-ui/note-'+width+'.png',Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'));await clickButton('Vazgeç');await waitFor('!document.querySelector(".modal-layer")');
 }
 assert.equal(events.length,0,events.join('\n'));
 console.log('Board actions PASS: no card names, block/resolve reason, disabled blocked completion, Undone validation/cancel/save/edit, persisted note, responsive card/dialog.');
};
