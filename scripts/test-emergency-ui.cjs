const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async({evaluate,command,navigate,clickButton,setFieldValue,sleep,events})=>{
 async function wait(expr){for(let i=0;i<100;i++){if(await evaluate(expr))return;await sleep(100);}throw Error('Timeout '+expr+' '+await evaluate('document.body.innerText.slice(-2000)'));}
 async function api(url,body,method='POST'){return JSON.parse(await evaluate(`(async()=>{const s=await(await fetch('/api/auth/session')).json();const r=await fetch('/api'+${JSON.stringify(url)},{method:${JSON.stringify(body?method:'GET')},headers:{'Content-Type':'application/json','X-CSRF-TOKEN':s.csrfToken},${body?'body:JSON.stringify('+JSON.stringify(body)+'),':''}});const text=await r.text();if(!r.ok)throw Error(r.status+' '+text);return text||'{}';})()`));}
 async function click(selector){const p=JSON.parse(await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing '+${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2});})()`));await command('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await command('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});}
 const sprint=(await api('/sprints')).find(s=>s.status==='active'),title='QA Emergency '+Date.now();
 fs.mkdirSync('tmp/emergency-ui',{recursive:true});
 await navigate('sprints/'+sprint.id+'/planning','Planlama');await clickButton('+ İş ekle');await clickButton('Yeni iş oluştur');await wait('!!document.querySelector("[name=newTitle]")');
 await setFieldValue('[name=newTitle]',title);await setFieldValue('[name=criteria]','Production restoration');await setFieldValue('[name=newHours]','8');
 await wait('[...document.querySelectorAll("app-sprint-add-dialog .person")].some(e=>e.innerText.includes("Elçim"))');await evaluate('[...document.querySelectorAll("app-sprint-add-dialog .person")].find(e=>e.innerText.includes("Elçim")).querySelector("input").id="qa-elcim"');await click('#qa-elcim');await wait('!!document.querySelector(\'[aria-label="Elçim efor saat"]\')');await setFieldValue('[aria-label="Elçim efor saat"]','8');
 await click('[name=newAcknowledged]');await click('[name=emergency]');await setFieldValue('[name=scopeReason]','Incident <img src=x onerror=alert(1)>');
 await command('Emulation.setDeviceMetricsOverride',{width:390,height:680,deviceScaleFactor:1,mobile:false});await sleep(100);
 assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
 fs.writeFileSync('tmp/emergency-ui/create-390.png',Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'));
 await clickButton('Oluştur ve sprinte ekle');await wait('!document.querySelector("app-sprint-add-dialog")');
 let current=await api('/sprints/'+sprint.id),urgent=current.items.find(t=>t.name===title);assert(urgent?.emergency);assert.equal(urgent.assignments[0].estimatedHours,8);
 const deferred=await api('/sprints/'+sprint.id+'/tasks/new',{title:'QA Deferred '+Date.now(),taskCategory:'DEV',size:'SMALL',estimatedHours:4,criteria:'Scope',reason:'Additional normal work',emergency:false,readinessAcknowledged:true,assignments:[]});
 await command('Emulation.clearDeviceMetricsOverride',{});
 await navigate('sprints/'+sprint.id+'/board','İşlerin durumu');await wait(`!!document.querySelector('[data-task-id="${urgent.id}"]')`);
 assert(await evaluate(`document.querySelector('[data-task-id="${urgent.id}"]').innerText.includes('Acil / plansız')`));
 await click('[data-task-id="'+deferred.id+'"] .board-task-title');await wait('document.querySelector("app-sprint-journal")?.innerText.includes("Sprinte eklendi")');await clickButton('Backlog’a geri gönder');
 await wait('!!document.querySelector("[name=flowReason]")');await setFieldValue('[name=flowReason]','Acil işe yer açmak için');await setFieldValue('[name=replacementTask]',urgent.id);await click('[name=confirmRemove]');await clickButton('Backlog’a geri gönder');
 await wait('!document.querySelector("[name=flowReason]")');current=await api('/sprints/'+sprint.id);assert(!current.items.some(t=>t.id===deferred.id));assert.equal((await api('/backlog/'+deferred.backlogId+'/readiness')).state,'Ready');
 await navigate('sprints/'+sprint.id+'/review','Sprintin şu anki fotoğrafı');
 await wait('!!document.querySelector("app-scope-summary .scope-track")');
 assert(await evaluate('document.querySelector("app-scope-summary").innerText.includes("Acil işe yer açmak için")'));
 assert(await evaluate('!document.querySelector("app-scope-summary img")'));
 await evaluate('window.__exports=[];const create=URL.createObjectURL;URL.createObjectURL=b=>{b.text().then(t=>window.__exports.push(t));return create(b)};HTMLAnchorElement.prototype.click=function(){}');
 await clickButton('Sprint özeti HTML indir');await wait('window.__exports.length===1');let html=await evaluate('window.__exports[0]');assert(html.includes(title));assert(html.includes('Acil işler ve kapsam değişimi'));assert(!html.includes('<img src=x'));
 fs.writeFileSync('tmp/emergency-ui/review.html',html);
 await navigate('reports','Raporlar');await clickButton('Acil işler / kapsam');await wait(`!!document.querySelector('app-scope-report option[value="${sprint.id}"]')`);await setFieldValue('app-scope-report select',sprint.id);
 await wait('document.querySelectorAll("app-scope-report app-scope-summary").length===1');
 await clickButton('HTML indir');await wait('window.__exports.length===2');html=await evaluate('window.__exports[1]');assert(html.includes('Kapsamdan çıkarıldı, Undone değil'));fs.writeFileSync('tmp/emergency-ui/report.html',html);
 for(const width of [1440,390]){await command('Emulation.setDeviceMetricsOverride',{width,height:950,deviceScaleFactor:1,mobile:false});await evaluate('document.querySelector("app-scope-report app-scope-summary").scrollIntoView({block:"start"})');await sleep(120);assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));fs.writeFileSync('tmp/emergency-ui/report-'+width+'.png',Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'));}
 await command('Emulation.clearDeviceMetricsOverride',{});
 await navigate('sprints/'+sprint.id+'/planning','Planlama');await clickButton('+ İş ekle');await clickButton('Yeni iş oluştur');await clickButton('Vazgeç');await wait('!document.querySelector("app-sprint-add-dialog")');
 assert.equal(events.length,0,events.join('\n'));console.log('Emergency UI PASS: direct admin creation, assignment, mobile modal, emergency badge, return/link without Undone, Review and scoped HTML exports, responsive report, cancel.');
};
