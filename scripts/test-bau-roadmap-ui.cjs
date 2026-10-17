const fs=require('node:fs'),assert=require('node:assert/strict');
module.exports=async({evaluate,command,navigate,clickButton,setFieldValue,sleep,events})=>{
  const root='tmp/bau-roadmap-20261008';
  const backup=JSON.parse(fs.readFileSync(root+'/rehearsal-result/after.json','utf8'));
  const expected=JSON.parse(fs.readFileSync(root+'/rehearsal-result/reports.json','utf8'));
  async function api(path,body){return JSON.parse(await evaluate(`(async()=>{const s=await(await fetch('/api/auth/session')).json();const r=await fetch('/api'+${JSON.stringify(path)},{method:${JSON.stringify(body===undefined?'GET':'POST')},headers:{'Content-Type':'application/json','X-CSRF-TOKEN':s.csrfToken},${body===undefined?'':'body:JSON.stringify('+JSON.stringify(body)+'),'}});if(!r.ok)throw Error(r.status+' '+await r.text());return JSON.stringify(await r.json())})()`));}
  async function waitFor(e){for(let i=0;i<60;i++){if(await evaluate(e))return;await sleep(100);}throw Error('Timeout: '+e);}
  async function shot(name){const s=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(root+'/'+name+'.png',Buffer.from(s.data,'base64'));}
  const preview=await api('/admin/backups/preview',backup);await api('/admin/backups/restore',{backup,...preview,confirmation:'GERİ YÜKLE'});
  assert.deepEqual(await api('/reports/roadmap'),expected);
  const bau=expected.find(r=>r.title==='BAU');assert.equal(bau.kind,'GENERAL');assert.equal(bau.backlogCount,64);
  const backlog=await api('/backlog');assert.equal(backlog.length,432);
  assert.equal(backlog.filter(b=>b.taskCategory==='BAU'&&b.roadmapId!==bau.id).length,0);
  assert.equal(backlog.filter(b=>b.taskCategory!=='BAU'&&b.roadmapId===bau.id).length,0);
  await navigate('roadmap','BAU');await waitFor('document.querySelectorAll(".roadmap-card").length===4');
  assert(await evaluate('[...document.querySelectorAll(".roadmap-card")].find(c=>c.querySelector("h2").textContent==="BAU").textContent.includes("Genel")'));
  await shot('roadmaps');await navigate('roadmap/'+bau.id,'BAU');await waitFor('document.querySelectorAll(".list-row").length===64');
  await clickButton('Düzenle');assert.equal(await evaluate('document.querySelector("[name=kind]").value'),'GENERAL');await clickButton('Vazgeç');
  await navigate('reports','Roadmap efor raporu');await waitFor('document.querySelector("app-roadmap-report tbody")?.innerText.includes("BAU")');
  await setFieldValue('app-roadmap-report select','GENERAL');
  assert.equal(await evaluate('document.querySelectorAll("app-roadmap-report tbody tr").length'),1);
  assert(await evaluate('document.querySelector("app-roadmap-report tbody").innerText.includes("BAU")'));
  await evaluate('document.querySelector("app-roadmap-report").scrollIntoView({block:"start"})');await sleep(150);await shot('general-filter');
  await setFieldValue('app-roadmap-report select','PROJECT');
  assert.equal(await evaluate('document.querySelectorAll("app-roadmap-report tbody tr").length'),2);
  assert(!await evaluate('document.querySelector("app-roadmap-report tbody").innerText.includes("BAU")'));
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});await navigate('roadmap','BAU');await sleep(150);
  assert(!await evaluate('document.documentElement.scrollWidth>innerWidth+1'));await shot('mobile');
  assert.equal(events.length,0,events.join('\n'));console.log('BAU Roadmap UI PASS: 64 BAU only, GENERAL card/edit/filter, project exclusion, preserved reports, mobile.');
};
