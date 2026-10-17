const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async({evaluate,command,navigate,clickButton,setFieldValue,sleep,events})=>{
 async function wait(expr){for(let i=0;i<100;i++){if(await evaluate(expr))return;await sleep(100);}throw Error('Timeout '+expr);}
 async function api(path,body){return JSON.parse(await evaluate(`(async()=>{const s=await fetch('/api/auth/session').then(r=>r.json());const r=await fetch('/api'+${JSON.stringify(path)},{method:${JSON.stringify(body?'POST':'GET')},headers:{'Content-Type':'application/json','X-CSRF-TOKEN':s.csrfToken},${body?'body:JSON.stringify('+JSON.stringify(body)+'),':''}});if(!r.ok)throw Error(await r.text());return JSON.stringify(await r.json())})()`));}
 const title='QA rename '+Date.now(),renamed=title+' changed <img src=x>',s=(await api('/sprints')).find(s=>s.status==='active');
 const t=await api('/sprints/'+s.id+'/tasks/new',{title,size:'SMALL',taskCategory:'DEV',criteria:'QA',reason:'QA',readinessAcknowledged:true});
 await navigate('sprints/'+s.id+'/planning','İşler ve atamalar');
 const row='[data-planning-task="'+t.id+'"]';
 await clickButton('Adı düzenle',row+' button');await wait('!!document.querySelector("[name=newTaskTitle]")');
 await setFieldValue('[name=newTaskTitle]','cancelled');await clickButton('Vazgeç','app-work-item-action button');await wait('!document.querySelector("app-work-item-action")');
 assert.equal((await api('/sprints/'+s.id)).items.find(i=>i.id===t.id).name,title);
 await clickButton('Adı düzenle',row+' button');await wait('!!document.querySelector("[name=newTaskTitle]")');await setFieldValue('[name=newTaskTitle]',renamed);await clickButton('Adı kaydet','app-work-item-action button');
 await wait('!document.querySelector("app-work-item-action")');await wait('document.querySelector('+JSON.stringify(row)+').innerText.includes('+JSON.stringify(renamed)+')');
 assert(!await evaluate('document.querySelector('+JSON.stringify(row+' img')+')!==null'));
 assert.equal((await api('/backlog')).find(i=>i.id===t.backlogId).title,renamed);
 const journal=await api('/sprints/'+s.id+'/journal');assert(journal.some(e=>e.kind==='title-changed'&&e.details.to===renamed));
 const pool=await api('/backlog',{title:'QA delete '+Date.now(),size:'SMALL',taskCategory:'DEV',criteria:'QA'});
 await navigate('backlog','Backlog');
 // Query narrows the paginated list to the one disposable item.
 await setFieldValue('input[type=search]',pool.title);
 await wait('document.querySelectorAll("#backlog-results + .table-wrap tbody tr").length===1');
 await clickButton('Sil','#backlog-results + .table-wrap button');await wait('!!document.querySelector("app-work-item-action")');
 fs.mkdirSync('tmp/work-actions-ui',{recursive:true});
 for(const width of [1440,390]){
  await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await sleep(200);
  assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
  fs.writeFileSync('tmp/work-actions-ui/delete-'+width+'.png',Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'));
 }
 await command('Emulation.clearDeviceMetricsOverride',{});
 await clickButton('Vazgeç','app-work-item-action button');await wait('!document.querySelector("app-work-item-action")');assert((await api('/backlog')).some(i=>i.id===pool.id));
 await clickButton('Sil','#backlog-results + .table-wrap button');await wait('!!document.querySelector("app-work-item-action")');await clickButton('Evet, işi sil','app-work-item-action button');await wait('!document.querySelector("app-work-item-action")');
 await wait('!document.querySelector("#backlog-results + .table-wrap tbody")?.innerText.includes('+JSON.stringify(pool.title)+')');
 assert(!(await api('/backlog')).some(i=>i.id===pool.id));assert.equal(events.length,0,events.join('\n'));
 console.log('Work actions UI PASS: rename/cancel, linked backlog/journal, safe text, delete/cancel/refresh, desktop/mobile.');
};
