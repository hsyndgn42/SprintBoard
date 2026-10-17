// Run only through smoke-ui's disposable-4183 guard. No live login/account changes.
const fs=require('node:fs'),assert=require('node:assert/strict');
module.exports=async({evaluate,command,navigate,setFieldValue,sleep,events})=>{
  const root='tmp/roadmap-map-20261008';
  const backup=JSON.parse(fs.readFileSync(root+'/rehearsal-result/after.json','utf8'));
  const expected=JSON.parse(fs.readFileSync(root+'/rehearsal-result/reports.json','utf8'));
  async function api(path,body){return JSON.parse(await evaluate(`(async()=>{const s=await(await fetch('/api/auth/session')).json();const r=await fetch('/api'+${JSON.stringify(path)},{method:${JSON.stringify(body===undefined?'GET':'POST')},headers:{'Content-Type':'application/json','X-CSRF-TOKEN':s.csrfToken},${body===undefined?'':'body:JSON.stringify('+JSON.stringify(body)+'),'}});if(!r.ok)throw Error(r.status+' '+await r.text());return JSON.stringify(await r.json())})()`));}
  async function waitFor(expression){for(let i=0;i<60;i++){if(await evaluate(expression))return;await sleep(100);}throw Error('Timeout: '+expression);}
  async function shot(name){const s=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(root+'/'+name+'.png',Buffer.from(s.data,'base64'));}
  const preview=await api('/admin/backups/preview',backup);
  await api('/admin/backups/restore',{backup,...preview,confirmation:'GERİ YÜKLE'});
  assert.deepEqual(await api('/reports/roadmap'),expected);
  const backlog=await api('/backlog');assert.equal(backlog.length,432);assert.equal(backlog.filter(b=>!b.roadmapId).length,0);assert.equal(backlog.filter(b=>!b.taskId).length,0);
  await navigate('roadmap','Bulk SMS Projesi');
  await waitFor('document.querySelectorAll(".roadmap-card").length===3');
  for(const target of expected)assert(await evaluate('document.querySelector("main").innerText.includes('+JSON.stringify(target.title)+')'));
  await shot('roadmap-desktop');
  for(const target of expected){
    await navigate('roadmap/'+target.id,target.title);
    await waitFor('document.querySelectorAll(".list-row").length==='+target.backlogCount);
  }
  await navigate('reports','Roadmap efor raporu');
  await waitFor('document.querySelector("app-roadmap-report tbody")?.innerText.includes("VIBE 3.0")');
  await evaluate('document.querySelector("app-roadmap-report").scrollIntoView({block:"start"})');await sleep(150);await shot('reports-desktop');
  await setFieldValue('app-roadmap-report input','NonTelco');
  assert(await evaluate('document.querySelector("app-roadmap-report tbody").innerText.includes("NonTelco")'));
  assert(!await evaluate('document.querySelector("app-roadmap-report tbody").innerText.includes("Bulk SMS")'));
  await navigate('backlog','İş listesi');
  await waitFor('[...document.querySelectorAll("select option")].some(o=>o.textContent.includes("VIBE 3.0 Ürün Geliştirmesi"))');
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
  await navigate('roadmap','Bulk SMS Projesi');await sleep(150);
  assert(!await evaluate('document.documentElement.scrollWidth>innerWidth+1'));await shot('roadmap-mobile');
  assert.equal(events.length,0,events.join('\n'));
  console.log('Roadmap mapping UI PASS: 3 cards, 432 historical links/details, empty pool, exact report totals, target filter/options, mobile bounds.');
};
