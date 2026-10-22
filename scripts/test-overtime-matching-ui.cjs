module.exports=async({evaluate,command,navigate,clickButton,setFieldValue,sleep,events})=>{
 const assert=require('node:assert/strict'),fs=require('node:fs');
 const api=async p=>JSON.parse(await evaluate(`fetch('/api'+${JSON.stringify(p)}).then(r=>r.json()).then(JSON.stringify)`));
 async function wait(expr){for(let i=0;i<120;i++){if(await evaluate(expr))return;await sleep(100);}throw Error('Timeout '+expr+' '+await evaluate('document.body.innerText.slice(-1200)'));}
 const inbox=await api('/admin/slack/overtime-inbox?filter=ALL&page=0');const source=inbox.items.find(p=>p.reason==='QA-MATCH-0');assert(source);
 const member=source.suggestedMemberId,sprint=source.suggestedSprintId;
 const cap=await api('/sprints/'+sprint+'/capacity');
 const plan=(await api('/overtime/entries')).find(e=>e.memberId===member&&e.plannedHours===16);assert(plan);
 await navigate('overtime','Fazla mesai');await wait('!!document.querySelector("app-slack-overtime-inbox")');
 async function open(reason){await evaluate(`[...document.querySelectorAll('app-slack-overtime-inbox .entry-head')].find(e=>e.textContent.includes(${JSON.stringify(reason)})).click()`);await wait('!!document.querySelector("app-overtime-plan-picker select:not([disabled])")');}
 if(source.status==='PENDING')for(let i=0;i<3;i++){
  await open('QA-MATCH-'+i);await setFieldValue('[aria-label="Mesai karar gerekçesi"]','QA admin doğruladı');await evaluate(`document.querySelector('[aria-label="Mesai eşleştirme onayı"]').click()`);
  assert(await evaluate('[...document.querySelectorAll("app-slack-overtime-inbox button")].find(b=>b.textContent.includes("Onayla ve hakedişe ekle")).disabled'));
  await setFieldValue('[aria-label="Mesai plan durumu"]',i<2?'PLANNED':'UNPLANNED');
  if(i<2){await setFieldValue('[aria-label="İlgili mesai planı"]',plan.id);await sleep(100);const text=await evaluate('document.querySelector(".plan-preview").innerText');assert(text.includes(i===0?'8 sa':'20 sa'));}
  if(i===1){fs.mkdirSync('tmp/overtime-matching-ui',{recursive:true});for(const width of [1440,390]){await command('Emulation.setDeviceMetricsOverride',{width,height:1100,deviceScaleFactor:1,mobile:false});await evaluate('document.querySelector("app-overtime-plan-picker").scrollIntoView({block:"center"})');await sleep(150);assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));fs.writeFileSync('tmp/overtime-matching-ui/approval-'+width+'.png',Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'));}await command('Emulation.clearDeviceMetricsOverride',{});}
  await clickButton('Onayla ve hakedişe ekle','app-slack-overtime-inbox button');await wait('!document.querySelector("app-slack-overtime-inbox .entry-body")');
 }
 // The application request approval uses the same explicit plan choice.
 const request=(await api('/self/overtime-requests')).find(r=>r.member_id===member&&r.reason==='QA-MATCH-REQUEST');assert(request);
 if(request.status==='PENDING'){
 await evaluate(`document.querySelector('[data-request-id="${request.id}"] .btn.primary').click()`);await wait('!!document.querySelector(".modal app-overtime-plan-picker select:not([disabled])")');
 await setFieldValue('.modal [aria-label="Mesai plan durumu"]','PLANNED');await setFieldValue('.modal [aria-label="İlgili mesai planı"]',plan.id);await setFieldValue('textarea[name=decisionNote]','QA onay');await clickButton('Kararı kaydet','.modal button');await wait('!document.querySelector(".modal")');
 }
 assert.deepEqual(await api('/sprints/'+sprint+'/capacity'),cap);
 const entries=(await api('/overtime/entries')).filter(e=>e.memberId===member);assert.equal(entries.find(e=>e.id===plan.id).planActualHours,22);assert.equal(entries.filter(e=>e.planId===plan.id).length,3);assert.equal(entries.filter(e=>e.planClassification==='UNPLANNED').reduce((n,e)=>n+e.earnedHours,0),3);
 await evaluate("window.__exports=[];const original=URL.createObjectURL;URL.createObjectURL=b=>{b.text().then(t=>window.__exports.push(t));return original(b)};HTMLAnchorElement.prototype.click=function(){}");
 await navigate('reports','Raporlar');await clickButton('Mesai');await wait('!!document.querySelector("app-overtime-trend .metrics")');await setFieldValue('app-overtime-trend .filters select',member);await sleep(150);
 const metrics=await evaluate('document.querySelector("app-overtime-trend").innerText');for(const expected of ['25 sa','16 sa','6 sa','3 sa'])assert(metrics.includes(expected),expected);
 await evaluate('document.querySelector("app-overtime-trend app-report-html-export button").click()');await wait('window.__exports.length===1');const html=await evaluate('window.__exports[0]');assert(html.includes('6 sa aşan'));assert(html.includes('3 sa plansız'));assert(html.includes('Mesai Plan QA'));
 for(const width of [1440,390]){await command('Emulation.setDeviceMetricsOverride',{width,height:1100,deviceScaleFactor:1,mobile:false});await evaluate('document.querySelector("app-overtime-trend").scrollIntoView({block:"start"});window.scrollBy(0,-85)');await sleep(150);assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));fs.mkdirSync('tmp/overtime-matching-ui',{recursive:true});fs.writeFileSync('tmp/overtime-matching-ui/report-'+width+'.png',Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'));}
 assert.equal(events.length,0,events.join('\n'));console.log('Overtime matching UI PASS: Slack 8+12 planned, 3 unplanned, app request 2 planned, capacity unchanged, explicit choices, filtered charts and HTML, desktop/mobile.');
};
