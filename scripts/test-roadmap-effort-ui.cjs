const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async({evaluate,command,navigate,clickButton,setFieldValue,sleep,events})=>{
  async function api(path,body,method='POST'){return JSON.parse(await evaluate(`(async()=>{const s=await(await fetch('/api/auth/session')).json();const r=await fetch('/api'+${JSON.stringify(path)},{method:${JSON.stringify(body===undefined?'GET':method)},headers:{'Content-Type':'application/json','X-CSRF-TOKEN':s.csrfToken},${body===undefined?'':'body:JSON.stringify('+JSON.stringify(body)+'),'}});if(!r.ok)throw Error(r.status+' '+await r.text());return JSON.stringify(await r.json())})()`));}
  async function waitFor(e){for(let i=0;i<60;i++){if(await evaluate(e))return;await sleep(100);}throw Error('Timeout: '+e);}
  fs.mkdirSync('tmp/roadmap-v24-ui',{recursive:true});
  async function shot(name){const s=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync('tmp/roadmap-v24-ui/'+name+'.png',Buffer.from(s.data,'base64'));}
  await navigate('roadmap','Roadmap');await clickButton('+ Hedef ekle');
  await setFieldValue('[name=title]','QA Migration Project');await setFieldValue('[name=kind]','PROJECT');await setFieldValue('[name=referenceId]','TC-25142');
  await shot('create');await clickButton('Kaydet');await waitFor('!document.querySelector(".modal-layer")');
  let target=(await api('/roadmap')).find(t=>t.title==='QA Migration Project');assert.equal(target.kind,'PROJECT');assert.equal(target.referenceId,'TC-25142');
  await navigate('roadmap/'+target.id,'QA Migration Project');await clickButton('Düzenle');
  await setFieldValue('[name=kind]','FEATURE_SET');await setFieldValue('[name=referenceId]','TC-25142-F1');await clickButton('Kaydet');await waitFor('!document.querySelector(".modal-layer")');
  target=(await api('/roadmap')).find(t=>t.id===target.id);assert.equal(target.kind,'FEATURE_SET');assert.equal(target.referenceId,'TC-25142-F1');
  const other=await api('/roadmap',{title:'QA Empty Project',kind:'PROJECT',referenceId:'TC-EMPTY'});
  const b=await api('/backlog',{title:'QA Roadmap linked task',roadmapId:target.id,criteria:'Accepted',priority:'HIGH',size:'SMALL',estimatedHours:60});
  const task=await api('/sprints/legacy-sprint-14/tasks',{backlogId:b.id,reason:'QA plan'});
  await api('/tasks/'+task.id+'/assignments',{assignments:[{memberId:'legacy-member-akin',estimatedHours:8,supportOnly:false},{memberId:'legacy-member-cemil',estimatedHours:4,supportOnly:false},{memberId:'legacy-member-sakir',estimatedHours:0,supportOnly:true}]},'PUT');
  await api('/tasks/'+task.id,{status:'done'},'PATCH');
  await api('/backlog',{title:'QA Future work',roadmapId:target.id,size:'SMALL',estimatedHours:20});
  let report=(await api('/reports/roadmap')).find(t=>t.id===target.id);assert.equal(report.assignedHours,12);assert.equal(report.doneHours,12);assert.equal(report.poolEstimatedHours,20);assert.equal(report.taskCount,1);assert.equal(report.supportAssignmentCount,1);
  assert.equal((await api('/reports/roadmap')).find(t=>t.id===other.id).assignedHours,0);
  await navigate('backlog','İş listesi');await waitFor('document.querySelector("main").innerText.includes("TC-25142-F1")');
  await navigate('reports','Raporlar');await clickButton('Roadmap eforu');await waitFor('document.querySelector("app-roadmap-report")?.innerText.includes("QA Migration Project")');
  await evaluate('document.querySelector("app-roadmap-report").scrollIntoView({block:"start"})');await sleep(150);await shot('report');
  assert(await evaluate('document.querySelector("app-roadmap-report").innerText.includes("Gerçek harcanan süre kaydı yoktur")'));
  await setFieldValue('app-roadmap-report input','TC-25142-F1');assert(!await evaluate('document.querySelector("app-roadmap-report tbody").innerText.includes("QA Empty Project")'));
  // Capture generated CSV without saving through the browser UI.
  await evaluate('window.__roadmapCsv="";window.__oldCreate=URL.createObjectURL;URL.createObjectURL=(blob)=>{blob.text().then(t=>window.__roadmapCsv=t);return window.__oldCreate(blob)}');
  await clickButton('Roadmap CSV indir');await waitFor('!!window.__roadmapCsv');
  const csv=await evaluate('window.__roadmapCsv');assert(csv.includes('TC-25142-F1'));assert(csv.includes('"12"'));assert(!csv.includes('TC-EMPTY'));assert(csv.includes('gerçek harcanan süre değildir'));
  await command('Emulation.setEmulatedMedia',{media:'print'});await sleep(150);await shot('print');await command('Emulation.setEmulatedMedia',{media:''});
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});await sleep(200);
  assert(!await evaluate('document.documentElement.scrollWidth>innerWidth+1'));await shot('mobile');
  await navigate('roadmap/'+target.id,'QA Migration Project');await clickButton('Düzenle');await sleep(100);assert(!await evaluate('document.querySelector(".modal").getBoundingClientRect().top<0'));await shot('mobile-edit');await clickButton('Vazgeç');
  assert.equal(events.length,0,events.join('\n'));console.log('Roadmap UI PASS: project/feature create/edit reference, linked effort 12h vs 60h estimate, X support, 20h separate pool, empty target, filters, CSV, print media and mobile.');
};
