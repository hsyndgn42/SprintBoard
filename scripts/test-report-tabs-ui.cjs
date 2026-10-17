const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async({evaluate,command,navigate,clickButton,setFieldValue,sleep,events})=>{
 async function api(path){return JSON.parse(await evaluate(`fetch('/api'+${JSON.stringify(path)}).then(r=>{if(!r.ok)throw Error(r.status);return r.json()}).then(JSON.stringify)`));}
 async function waitFor(e){for(let i=0;i<100;i++){if(await evaluate(e))return;await sleep(100);}throw Error('Timeout '+e);}
 const before=await api('/export');
 await navigate('reports','Raporlar');
 await waitFor('[...document.querySelectorAll("button")].some(b=>b.textContent==="Tüm raporlar PDF"&&!b.disabled)');
 const ids=['delivery','members','context','types','roadmap','capacity','defects'];
 const labels=['Sprint teslimatı','Kişi dağılımı','Katılım bağlamı','İş tipleri','Roadmap eforu','Kapasite trendi','Defect'];
 const visible=()=>evaluate('JSON.stringify([...document.querySelectorAll(".report-tab-panel")].filter(e=>e.checkVisibility()).map(e=>e.id))');
 assert.equal(await evaluate('document.querySelectorAll(".report-tabs [role=tab]").length'),7);
 for(let i=0;i<ids.length;i++){
  await clickButton(labels[i]);
  assert.deepEqual(JSON.parse(await visible()),['report-panel-'+ids[i]]);
  assert(await evaluate(`document.querySelector('#report-tab-${ids[i]}').getAttribute('aria-selected')==='true'`));
 }
 // Keyboard roving focus, wrap and Home/End.
 await evaluate('document.querySelector("#report-tab-defects").focus()');
 await command('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
 await waitFor('document.activeElement.id==="report-tab-delivery"');
 await command('Input.dispatchKeyEvent',{type:'keyDown',key:'End',code:'End',windowsVirtualKeyCode:35});
 assert.equal(await evaluate('document.activeElement.id'),'report-tab-defects');
 await clickButton('Kişi dağılımı');
 const members=await api('/reports/members'),sprints=await api('/reports');
 const person=members.find(m=>m.memberName.includes('sa'))||members[0];
 await setFieldValue('#report-panel-members input',person.memberName);
 await clickButton('Katılım bağlamı');
 assert.equal(await evaluate('document.querySelector("#report-panel-context input").value'),person.memberName);
 await waitFor('document.querySelectorAll(".context-visual .visual-row").length===1');
 const sum=(key)=>members.filter(m=>m.memberId===person.memberId).reduce((n,m)=>n+(m[key]||0),0);
 const fmt=n=>new Intl.NumberFormat('tr-TR',{maximumFractionDigits:1}).format(n);
 const context=await evaluate('document.querySelector(".context-visual").innerText');
 assert(context.includes(fmt(sum('effortHours'))+' sa'));assert(context.includes(fmt(sum('leaveDays'))+' gün izin'));assert(context.includes(sum('supportTaskCount')+' X destek ataması'));
 await setFieldValue('#report-panel-context input','NO-MATCH-REPORT-QA');
 await waitFor('!document.querySelector(".context-visual")');
 await setFieldValue('#report-panel-context input','');
 await waitFor('!!document.querySelector(".context-visual")');
 await clickButton('Roadmap eforu');
 const roads=await api('/reports/roadmap');
 assert.equal(Number(await evaluate('document.querySelectorAll(".roadmap-visual .visual-row").length')),roads.length);
 if(roads.length){
  const row=roads[0];
  await setFieldValue('#report-panel-roadmap input',row.title);
  await waitFor('document.querySelectorAll(".roadmap-visual .visual-row").length===1');
  const widths=JSON.parse(await evaluate('JSON.stringify([...document.querySelectorAll(".roadmap-visual .visual-track>span")].map(e=>parseFloat(e.style.width)))'));
  assert.deepEqual(widths.map(n=>Math.round(n*1000)/1000),[row.doneHours,row.undoneHours,row.openHours].map(n=>Math.round(100*n/Math.max(1,row.assignedHours)*1000)/1000));
  await clickButton('Kapasite trendi');await clickButton('Roadmap eforu');
  assert.equal(await evaluate('document.querySelector("#report-panel-roadmap input").value'),row.title);
  await setFieldValue('#report-panel-roadmap input','');
 }
 await clickButton('Kapasite trendi');
 await waitFor('document.querySelectorAll(".trend-timeline g").length===6');
 const recent=[...sprints].sort((a,b)=>a.number-b.number).slice(-6);
 const chosen=members.filter(m=>recent.some(s=>s.id===m.sprintId));
 const core=chosen.filter(m=>m.engagement!=='SUPPORT'&&m.teamRole!=='ARCHITECT'&&m.capacitySource!=='UNSPECIFIED_SUPPORT');
 const total=rows=>rows.reduce((n,m)=>n+m.effortHours,0);
 const totals=JSON.parse(await evaluate('JSON.stringify([...document.querySelectorAll(".visual-equation strong")].map(e=>e.textContent.trim()))'));
 const fmt2=n=>new Intl.NumberFormat('tr-TR',{maximumFractionDigits:2}).format(n)+' sa';
 assert.deepEqual(totals,[fmt2(total(core)),fmt2(total(chosen)-total(core)),fmt2(total(chosen))]);
 assert(await evaluate('[...document.querySelectorAll(".trend-timeline rect")].every(e=>Number.isFinite(+e.getAttribute("height"))&&+e.getAttribute("height")>=0)'));
 await setFieldValue('[name=trendMember]',person.memberId);await clickButton('Sprint teslimatı');await clickButton('Kapasite trendi');
 assert.equal(await evaluate('document.querySelector("[name=trendMember]").value'),person.memberId);
 await setFieldValue('[name=trendMember]','');
 fs.mkdirSync('tmp/report-tabs-ui',{recursive:true});
 for(const width of [1440,800,390]){
  await command('Emulation.setDeviceMetricsOverride',{width,height:1050,deviceScaleFactor:1,mobile:false});
  for(const label of ['Katılım bağlamı','Roadmap eforu','Kapasite trendi']){
   await clickButton(label);await sleep(150);
   assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'overflow '+width+' '+label);
   await evaluate('window.scrollTo(0,0)');
   const shot=await command('Page.captureScreenshot',{format:'png'});
   fs.writeFileSync('tmp/report-tabs-ui/'+labels.indexOf(label)+'-'+width+'.png',Buffer.from(shot.data,'base64'));
   const selector=label==='Katılım bağlamı'?'.context-visual':label==='Roadmap eforu'?'.roadmap-visual':'.capacity-visual';
   await evaluate(`document.querySelector('${selector}').scrollIntoView({block:'start'});window.scrollBy(0,-90)`);await sleep(100);
   const focused=await command('Page.captureScreenshot',{format:'png'});
   fs.writeFileSync('tmp/report-tabs-ui/'+labels.indexOf(label)+'-'+width+'-chart.png',Buffer.from(focused.data,'base64'));
  }
 }
 await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
 await command('Emulation.setEmulatedMedia',{media:'print'});
 assert.equal(await evaluate('getComputedStyle(document.querySelector(".report-tabs")).display'),'none');
 for(const id of ids)assert.equal(await evaluate(`getComputedStyle(document.querySelector('#report-panel-${id}')).display`),id==='context'?'none':'block');
 assert(await evaluate('getComputedStyle(document.querySelector(".trend-timeline")).display!=="none"'));
 assert(await evaluate('getComputedStyle(document.querySelector(".roadmap-visual")).display!=="none"'));
 await command('Emulation.setEmulatedMedia',{media:''});
 assert.deepEqual(JSON.parse(await visible()),['report-panel-capacity']);
 assert.deepEqual((await api('/export')).tables,before.tables);
 assert.equal(events.length,0,events.join('\n'));
 console.log('Report tabs PASS: 7 panels, keyboard, retained filters, chart/API parity, empty state, print privacy, 1440/800/390px, no data mutation.');
};
