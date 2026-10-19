const assert=require('node:assert/strict');
module.exports=async({evaluate,navigate,setFieldValue,api,waitFor,sprint,member,shot})=>{
 const next=await api('/sprints',{name:'Planlanan QA sprint',start:'2026-10-27',end:'2026-11-16'});
 const draft=title=>({title,criteria:'QA',taskCategory:'DEV',size:'SMALL',estimatedHours:1,readinessAcknowledged:true,reason:'QA',assignments:[{memberId:member.id,estimatedHours:1,supportOnly:false}]});
 const active=await api('/sprints/'+sprint.id+'/tasks/new',draft('KonumQA aktif'));
 await api('/tasks/'+active.id,{status:'done'},'PATCH');
 await api('/sprints/'+next.id+'/tasks/new',draft('KonumQA planlanan'));
 await api('/backlog',{title:'KonumQA havuz',criteria:'QA',taskCategory:'DEV',size:'SMALL',estimatedHours:1});
 await navigate('overview','VIBE');await navigate('backlog','İş listesi');await setFieldValue('input[type=search]','KonumQA');
 for(const [view,count]of [['open',3],['Ready',1],['ACTIVE',1],['PLANNED',1],['POOL_ACTIVE',2],['POOL_PLANNED',2],['IN_SPRINT',2],['Done',1],['all',3]]){
  await setFieldValue('[aria-label="Backlog görünümü"]',view);await waitFor('document.querySelectorAll("tr[data-backlog-id]").length==='+count);
  if(view==='PLANNED')assert(await evaluate('document.querySelector("tr[data-backlog-id]").innerText.includes("Planlanan sprint")'));
  if(view==='ACTIVE')assert(await evaluate('document.querySelector("tr[data-backlog-id]").innerText.includes("Aktif sprint")'));
 }
 await shot('backlog-sprint-locations');
 const overview=await api('/overview');await navigate('overview','VIBE');await waitFor('document.querySelectorAll(".metric").length>0');
 assert(await evaluate('document.querySelector(".metric").innerText.includes('+JSON.stringify(overview.completedSprints+' kapanmış · '+overview.activeSprints+' aktif · '+overview.plannedSprints+' planlanan')+')'));await shot('overview-sprint-statuses');
 const before=await api('/sprints/'+sprint.id),reserve=before.items.find(t=>t.taskSubtype==='DEFECT_SUPPORT');
 const defect=await api('/sprints/'+sprint.id+'/tasks/new',{...draft('Rezerv kapsam QA'),taskCategory:'DEFECT',taskSubtype:'TEST_DEFECT',reserveTaskId:reserve.id});
 const after=await api('/sprints/'+sprint.id);assert.equal(after.flow.added,before.flow.added);assert.equal(after.items.find(t=>t.id===defect.id).emergency,false);assert.equal(after.flow.events.find(e=>e.task.id===defect.id).scopeChange,false);
 await navigate('sprints/'+sprint.id+'/board','Düzeltilmiş sprint');await waitFor('!!document.querySelector("app-sprint-flow")');await evaluate('document.querySelector("app-sprint-flow details").open=true');assert(await evaluate('document.querySelector("app-sprint-flow").innerText.includes("Rezerv içi")'));await shot('reserve-scope-flow');
 console.log('PASS: overview status breakdown, all backlog location combinations including active Done, reserve intake excluded from scope growth.');
};
