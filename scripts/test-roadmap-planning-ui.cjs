const fs=require('node:fs'),assert=require('node:assert/strict');
module.exports=async({evaluate,command,navigate,clickButton,setFieldValue,sleep,events})=>{
  async function api(path,body,method='POST'){return JSON.parse(await evaluate(`(async()=>{const s=await(await fetch('/api/auth/session')).json();const r=await fetch('/api'+${JSON.stringify(path)},{method:${JSON.stringify(body===undefined?'GET':method)},headers:{'Content-Type':'application/json','X-CSRF-TOKEN':s.csrfToken},${body===undefined?'':'body:JSON.stringify('+JSON.stringify(body)+'),'}});if(!r.ok)throw Error(r.status+' '+await r.text());return JSON.stringify(await r.json())})()`));}
  async function waitFor(e){for(let i=0;i<80;i++){if(await evaluate(e))return;await sleep(100);}throw Error('Timeout: '+e);}
  await api('/roadmap',{title:'QA Erken',kind:'FEATURE_SET',targetDate:'2026-11-01',status:'active',priority:'LOW'});
  await api('/roadmap',{title:'QA BAU',kind:'GENERAL',status:'completed',priority:'NORMAL'});
  await navigate('roadmap','+ Hedef ekle');await clickButton('+ Hedef ekle');
  await setFieldValue('[name=title]','QA Kritik');await setFieldValue('[name=referenceId]','TC-QA');
  await setFieldValue('[name=status]','on_hold');await setFieldValue('[name=priority]','CRITICAL');await setFieldValue('[name=targetDate]','2026-12-01');
  await clickButton('Kaydet');await waitFor('!document.querySelector(".modal-layer") && document.querySelectorAll(".roadmap-card").length>=3');
  let targets=await api('/roadmap'),target=targets.find(t=>t.title==='QA Kritik');assert.equal(target.status,'on_hold');assert.equal(target.priority,'CRITICAL');
  await setFieldValue('.roadmap-filters input','QA');await waitFor('document.querySelectorAll(".roadmap-card").length===3');
  assert.equal(await evaluate('document.querySelector(".roadmap-card h2").textContent'),'QA Kritik');
  await setFieldValue('.roadmap-filters label:nth-child(2) select','on_hold');await waitFor('document.querySelectorAll(".roadmap-card").length===1');
  assert(await evaluate('document.querySelector(".roadmap-card").textContent.includes("Beklemede")'));
  await setFieldValue('.roadmap-filters label:nth-child(3) select','LOW');await waitFor('!!document.querySelector(".empty")');await clickButton('Filtreleri temizle');
  await setFieldValue('.roadmap-filters input','QA');await setFieldValue('.roadmap-filters label:nth-child(5) select','date');
  await waitFor('document.querySelector(".roadmap-card h2")?.textContent==="QA Erken"');
  await setFieldValue('.roadmap-filters label:nth-child(4) select','GENERAL');await waitFor('document.querySelectorAll(".roadmap-card").length===1');assert.equal(await evaluate('document.querySelector(".roadmap-card h2").textContent'),'QA BAU');
  await navigate('roadmap/'+target.id,'QA Kritik');await clickButton('Düzenle');
  assert.equal(await evaluate('document.querySelector("[name=status]").value'),'on_hold');
  await setFieldValue('[name=status]','completed');await setFieldValue('[name=priority]','HIGH');await clickButton('Kaydet');await waitFor('!document.querySelector(".modal-layer")');
  await command('Page.reload',{ignoreCache:true});await waitFor('document.querySelector("main")?.textContent.includes("Hedef durumu")');
  assert(await evaluate('document.querySelector("main").textContent.includes("Tamamlandı")'));
  target=(await api('/roadmap')).find(t=>t.id===target.id);assert.equal(target.status,'completed');assert.equal(target.priority,'HIGH');assert.equal(target.doneCount,0);
  await clickButton('Düzenle');await setFieldValue('[name=title]','Do not save');await clickButton('Vazgeç');assert.equal((await api('/roadmap')).find(t=>t.id===target.id).title,'QA Kritik');
  await navigate('roadmap','+ Hedef ekle');await setFieldValue('.roadmap-filters input','QA');
  fs.mkdirSync('tmp/roadmap-planning-20261008',{recursive:true});
  for(const width of [1440,390]){
    await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await sleep(200);
    assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Horizontal overflow '+width);
    const shot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync('tmp/roadmap-planning-20261008/roadmap-'+width+'.png',Buffer.from(shot.data,'base64'));
  }
  await clickButton('+ Hedef ekle');assert(await evaluate('(()=>{const r=document.querySelector(".modal").getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight+1})()'));
  await clickButton('Vazgeç');assert.equal(events.length,0,events.join('\n'));
  console.log('Roadmap planning UI PASS: create/edit/reload/cancel, status/priority/type/search filters, sort, independent completion, 1440/390px and mobile modal bounds.');
};
