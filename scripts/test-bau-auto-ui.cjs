const fs=require('node:fs'),assert=require('node:assert/strict');
module.exports=async({evaluate,command,navigate,clickButton,setFieldValue,sleep,events})=>{
  const backup=JSON.parse(fs.readFileSync('backups/bau-roadmap-20261008/applied/after.json','utf8'));
  async function api(path,body,method='POST'){return JSON.parse(await evaluate(`(async()=>{const s=await(await fetch('/api/auth/session')).json();const r=await fetch('/api'+${JSON.stringify(path)},{method:${JSON.stringify(body===undefined?'GET':method)},headers:{'Content-Type':'application/json','X-CSRF-TOKEN':s.csrfToken},${body===undefined?'':'body:JSON.stringify('+JSON.stringify(body)+'),'}});if(!r.ok)throw Error(r.status+' '+await r.text());return JSON.stringify(await r.json())})()`));}
  async function waitFor(e){for(let i=0;i<60;i++){if(await evaluate(e))return;await sleep(100);}throw Error('Timeout: '+e);}
  const preview=await api('/admin/backups/preview',backup);await api('/admin/backups/restore',{backup,...preview,confirmation:'GERİ YÜKLE'});
  const before=await api('/export'),targets=await api('/roadmap'),bau=targets.find(t=>t.title==='BAU'),oldReports=await api('/reports/roadmap');
  await navigate('sprints','Sprintler');await clickButton('+ Yeni sprint');
  assert(await evaluate('document.querySelector(".modal").textContent.includes("Genel türündeki BAU Roadmap")'));
  await setFieldValue('[name=name]','QA Sprint 17');await setFieldValue('[name=start]','2026-10-27');await setFieldValue('[name=end]','2026-11-16');await clickButton('Sprint oluştur');await waitFor('!document.querySelector(".modal-layer")');
  const sprints=await api('/sprints'),s=sprints.find(s=>s.name==='QA Sprint 17');assert.equal(s.status,'planned');assert.equal(sprints.find(s=>s.number===16).status,'active');
  let backlog=await api('/backlog');const tasks=backlog.filter(b=>b.sprintId===s.id);assert.equal(tasks.length,4);assert(tasks.every(b=>b.roadmapId===bau.id&&b.taskCategory==='BAU'));
  assert.equal((await api('/roadmap')).length,targets.length);
  const reports=await api('/reports/roadmap');for(const old of oldReports.filter(r=>r.id!==bau.id))assert.deepEqual(reports.find(r=>r.id===old.id),old);
  await navigate('backlog','İş listesi');await setFieldValue('.backlog-filters input','QA Sprint 17');await waitFor('document.querySelectorAll("tbody tr").length===4');
  assert(await evaluate('[...document.querySelectorAll("tbody select")].every(s=>s.selectedOptions[0].textContent==="BAU")'));
  fs.mkdirSync('tmp/bau-auto-20261008',{recursive:true});const shot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync('tmp/bau-auto-20261008/backlog.png',Buffer.from(shot.data,'base64'));
  await api('/roadmap/'+bau.id,{...bau,title:'Ekip Operasyonları'},'PUT');
  await api('/bau-templates',{title:'QA custom BAU',mode:'MANUAL',daysPerMember:0});
  const second=await api('/sprints',{name:'QA Sprint 18',start:'2026-11-17',end:'2026-12-07'});
  backlog=await api('/backlog');const secondTasks=backlog.filter(b=>b.sprintId===second.id);assert.equal(secondTasks.length,5);assert(secondTasks.every(b=>b.roadmapId===bau.id));assert.equal((await api('/roadmap')).length,4);
  const after=await api('/export');assert.equal(after.tables.product_setting.find(s=>s.setting_key==='bau_roadmap_id').setting_value,bau.id);
  for(const table of ['sprint','sprint_task','backlog_item','assignment','leave_record','overtime_entry','sprint_closure'])for(const row of before.tables[table]){
    const key='id' in row?'id':'sprint_id';assert.deepEqual(after.tables[table].find(r=>r[key]===row[key]),row,table+' old row');
  }
  assert.equal(events.length,0,events.join('\n'));console.log('BAU auto UI PASS: new sprint, 4 automatic links, unchanged active/history/project reports, custom template, renamed target reused by stable ID.');
};
