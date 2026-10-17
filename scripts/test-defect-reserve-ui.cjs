const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async({evaluate,command,navigate,clickButton,setFieldValue,sleep,events})=>{
 async function wait(expr){for(let i=0;i<100;i++){if(await evaluate(expr))return;await sleep(100);}throw Error('Timeout '+expr+' '+await evaluate('document.body.innerText.slice(-1800)'));}
 async function api(url,body,method='POST'){return JSON.parse(await evaluate(`(async()=>{const s=await(await fetch('/api/auth/session')).json();const r=await fetch('/api'+${JSON.stringify(url)},{method:${JSON.stringify(body?method:'GET')},headers:{'Content-Type':'application/json','X-CSRF-TOKEN':s.csrfToken},${body?'body:JSON.stringify('+JSON.stringify(body)+'),':''}});const text=await r.text();if(!r.ok)throw Error(r.status+' '+text);return text||'{}';})()`));}
 async function click(selector){const p=JSON.parse(await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing '+${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2});})()`));await command('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await command('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});}
 const s=(await api('/sprints')).find(s=>s.status==='active'),title='QA Reserve '+Date.now(),member='legacy-member-isa';
 const capacity=async()=>(await api('/sprints/'+s.id+'/capacity')).find(r=>r.memberId===member).plannedHours;
 const before=await capacity();
 const r=await api('/sprints/'+s.id+'/tasks/new',{title:title+' BAU',taskCategory:'BAU',taskSubtype:'DEFECT_SUPPORT',size:'SMALL',estimatedHours:16,criteria:'QA reserve',reason:'QA plan',readinessAcknowledged:true,assignments:[{memberId:member,estimatedHours:16,supportOnly:false}]});
 await navigate('sprints/'+s.id+'/planning','İşler ve atamalar');
 await clickButton('+ İş ekle');await clickButton('Yeni iş oluştur');await wait('!!document.querySelector("[name=newTitle]")');
 await setFieldValue('[name=newTitle]',title);await setFieldValue('[name=criteria]','Prod issue');
 await setFieldValue('[name=category]','DEFECT');await setFieldValue('[name=subtype]','PROD_DEFECT');await setFieldValue('[name=newHours]','10');
 await evaluate('[...document.querySelectorAll("app-sprint-add-dialog .person")].find(e=>e.innerText.trim()==="İsa").querySelector("input").id="qa-reserve-isa"');await click('#qa-reserve-isa');await wait('!!document.querySelector(\'[aria-label="İsa efor saat"]\')');await setFieldValue('[aria-label="İsa efor saat"]','10');
 assert(!await evaluate('document.querySelector("[name=defectVerification], [name=defectVerifier], [name=defectNote]")!==null'));
 await setFieldValue('[name=reserveTask]',r.id);await setFieldValue('[name=scopeReason]','QA incident');await click('[name=newAcknowledged]');
 await clickButton('Oluştur ve sprinte ekle');await wait('!document.querySelector("app-sprint-add-dialog")');
 const current=await api('/sprints/'+s.id),d=current.items.find(t=>t.name===title);assert(d);assert.equal(d.reserveTaskId,r.id);assert.equal(d.status,'todo');assert.equal(d.emergency,false);assert.equal(d.extraPlanHours,0);assert.equal(await capacity(),before+16);
 const selector='[data-planning-task="'+d.id+'"] app-reserve-link';
 await wait('!!document.querySelector('+JSON.stringify(selector+' select')+')');
 await setFieldValue(selector+' select','');await wait('!!document.querySelector('+JSON.stringify(selector+' button')+')');await click(selector+' button');await wait('!document.querySelector('+JSON.stringify(selector+' button')+')');assert.equal(await capacity(),before+26);
 await setFieldValue(selector+' select',r.id);await wait('!!document.querySelector('+JSON.stringify(selector+' button')+')');await click(selector+' button');await wait('!document.querySelector('+JSON.stringify(selector+' button')+')');assert.equal(await capacity(),before+16);
 await api('/tasks/'+d.id,{status:'done'},'PATCH');
 await navigate('sprints/'+s.id+'/review','Sprintin şu anki fotoğrafı');await wait('document.querySelector("app-defect-support-review")?.innerText.includes("Defect Support kapsamında alınan işler")');
 fs.mkdirSync('tmp/defect-reserve-ui',{recursive:true});
 for(const width of [1440,390]){
  await command('Emulation.setDeviceMetricsOverride',{width,height:950,deviceScaleFactor:1,mobile:false});await sleep(400);
  if(width===390&&await evaluate('document.querySelector(".sidebar")?.classList.contains("open")')){await click('.nav-close');await sleep(300);}
  await evaluate('document.querySelector("app-defect-support-review").scrollIntoView({block:"start"});window.scrollBy(0,-85)');
  assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
  fs.writeFileSync('tmp/defect-reserve-ui/review-'+width+'.png',Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'));
 }
 await command('Emulation.clearDeviceMetricsOverride',{});
 await evaluate('window.__reserveExports=[];const original=URL.createObjectURL;URL.createObjectURL=b=>{b.text().then(t=>window.__reserveExports.push(t));return original(b)};HTMLAnchorElement.prototype.click=function(){}');
 await wait('[...document.querySelectorAll("button")].some(b=>b.innerText==="Sprint özeti HTML indir"&&!b.disabled)');
 await clickButton('Sprint özeti HTML indir');await wait('window.__reserveExports.length===1');assert(await evaluate('window.__reserveExports[0].includes("Defect Support kapsamında alınan işler")&&!window.__reserveExports[0].includes("Rezerv ve plan")'));
 await navigate('reports','Raporlar');await clickButton('Defect');await wait('!!document.querySelector("app-defect-report app-defect-reserves")');
 await wait('[...document.querySelectorAll(".defect-filters select option")].some(o=>o.value==='+JSON.stringify(s.id)+')');
 await wait('!!document.querySelector("app-defect-report app-report-html-export button:not([disabled])")');
 await setFieldValue('.defect-filters select',s.id);
 await wait('document.querySelector("app-defect-report")?.innerText.includes("Prod / Test defect")');
 await clickButton('HTML indir');await wait('window.__reserveExports.length===2');assert(await evaluate('window.__reserveExports[1].includes("Defect Support · Rezerv ve plan")'));
 const exported=await evaluate('window.__reserveExports[1]');fs.writeFileSync('tmp/defect-reserve-ui/report.html',exported);
 await command('Page.navigate',{url:'data:text/html;charset=utf-8,'+encodeURIComponent(exported)});await sleep(400);
 await evaluate('[...document.querySelectorAll("h2")].find(e=>e.innerText.includes("Defect Support")).scrollIntoView({block:"start"})');
 fs.writeFileSync('tmp/defect-reserve-ui/report.png',Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'));
 assert.equal(events.length,0,events.join('\n'));
 console.log('Defect reserve UI PASS: create Prod defect with reserve, independent status, link/unlink and capacity refresh, Review desktop/mobile, report/Review HTML.');
};
