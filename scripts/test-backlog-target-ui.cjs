// Invoked only by the guarded disposable 4183 browser harness; never touches live data.
const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async({evaluate,command,navigate,clickButton,setFieldValue,sleep,events})=>{
  async function api(path,body,method='POST'){
    return JSON.parse(await evaluate(`(async()=>{const s=await(await fetch('/api/auth/session')).json();const r=await fetch('/api'+${JSON.stringify(path)},{method:${JSON.stringify(body===undefined?'GET':method)},headers:{'Content-Type':'application/json','X-CSRF-TOKEN':s.csrfToken},${body===undefined?'':'body:JSON.stringify('+JSON.stringify(body)+'),'}});if(!r.ok)throw Error(await r.text());return JSON.stringify(await r.json())})()`));
  }
  async function waitFor(expression){for(let i=0;i<50;i++){if(await evaluate(expression))return;await sleep(100);}throw Error('Timeout: '+expression);}
  const target=await api('/roadmap',{title:'QA Roadmap reference',description:'Isolated target'});
  await navigate('backlog','İş listesi');
  assert(!await evaluate('document.querySelector("main").innerText.includes("Sorumlu belirlenmemiş")'));
  assert(!await evaluate('[...document.querySelectorAll(".backlog-filters label")].some(l=>l.innerText.startsWith("Sorumlu"))'));
  await clickButton('+ Yeni iş');
  assert(!await evaluate('!!document.querySelector("[name=ownerId]")'));
  assert(await evaluate('document.querySelector("[name=roadmapId]").innerText.includes("Roadmap hedefine bağlı değil")'));
  await setFieldValue('[name=title]','QA ownerless backlog');await setFieldValue('[name=criteria]','Acceptance');
  await setFieldValue('[name=estimatedHours]','8');await setFieldValue('[name=size]','SMALL');await setFieldValue('[name=priority]','HIGH');
  await clickButton('İşi ekle');await waitFor('!document.querySelector(".modal-layer")');
  let items=await api('/backlog');let item=items.find(i=>i.title==='QA ownerless backlog');
  assert.equal(item.ownerId,null);assert.equal(item.readiness.ready,true);assert.equal(item.roadmapId,null);
  const row='[...document.querySelectorAll("tbody tr")].find(r=>r.innerText.includes("QA ownerless backlog"))';
  await waitFor(`!!(${row})`);
  await evaluate(`(()=>{const s=(${row}).querySelector('select');s.value=[...s.options].find(o=>o.textContent==='QA Roadmap reference').value;s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await waitFor(`!(${row}).querySelector('select').disabled && (${row}).querySelector('select').selectedOptions[0].textContent==='QA Roadmap reference'`);
  assert(!await evaluate(`!!(${row}).querySelector('.priority-badge, a[href^="#/roadmap/"]')`));
  item=(await api('/backlog')).find(i=>i.id===item.id);assert.equal(item.roadmapId,target.id);assert.equal(item.roadmapTitle,target.title);
  await clickButton('QA ownerless backlog');assert(!await evaluate('document.querySelector(".modal").innerText.includes("Sorumlu")'));
  assert(await evaluate(`!!document.querySelector('.modal a[href="#/roadmap/${target.id}"]')`));
  await evaluate(`document.querySelector('.modal a[href="#/roadmap/${target.id}"]').click()`);
  await waitFor('document.querySelector("main").innerText.includes("QA Roadmap reference") && document.querySelector("main").innerText.includes("QA ownerless backlog")');
  await navigate('backlog','İş listesi');await waitFor(`!!(${row})`);
  await command('Page.reload',{ignoreCache:true});await waitFor(`!!(${row})`);
  assert(await evaluate(`(${row}).querySelector('select').selectedOptions[0].textContent==='QA Roadmap reference'`));
  assert(!await evaluate(`!!(${row}).querySelector('.priority-badge, a[href^="#/roadmap/"]')`));
  await evaluate(`(()=>{const s=(${row}).querySelector('select');s.selectedIndex=0;s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await waitFor(`(${row}).querySelector('select').selectedIndex===0 && !(${row}).querySelector('select').disabled`);
  assert.equal((await api('/backlog')).find(i=>i.id===item.id).roadmapId,null);
  // Omitting the removed UI field must not erase legacy owner data in backups.
  const legacy=await api('/backlog',{title:'QA legacy owner',criteria:'Original',size:'SMALL',estimatedHours:8,priority:'HIGH',ownerId:'legacy-member-akin'});
  await navigate('overview','TOPLAM SPRİNT');await navigate('backlog','İş listesi');await clickButton('QA legacy owner');await clickButton('İşi düzenle');
  assert(!await evaluate('!!document.querySelector("[name=ownerId]")'));await setFieldValue('[name=criteria]','Edited without owner field');
  await clickButton('Değişiklikleri kaydet');await waitFor('!document.querySelector(".modal-layer")');
  assert.equal((await api('/backlog')).find(i=>i.id===legacy.id).ownerId,'legacy-member-akin');
  await clickButton('QA ownerless backlog');await clickButton('Kapat');
  await evaluate(`(()=>{const r=(${row});[...r.querySelectorAll('button')].find(b=>b.textContent.trim()==='Aktif sprinte al').click();})()`);
  await waitFor('document.querySelector("app-sprint-add-dialog")?.innerText.includes("Hazırlık kontrolleri tamam")');
  assert(!await evaluate('document.querySelector("app-sprint-add-dialog").innerText.includes("Sorumlu")'));await clickButton('Vazgeç');
  fs.mkdirSync('tmp/backlog-target-ui',{recursive:true});
  for(const width of [1440,390]){
    await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await sleep(250);
    assert(!await evaluate('document.documentElement.scrollWidth>innerWidth+1'));
    const shot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(`tmp/backlog-target-ui/${width}.png`,Buffer.from(shot.data,'base64'));
  }
  assert.equal(events.length,0,events.join('\n'));
  console.log('Backlog target UI: owner removed, ownerless readiness, link/unlink/reload/navigation, legacy owner preserved, desktop/mobile PASS');
};
