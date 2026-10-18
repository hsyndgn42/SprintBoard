const assert=require('node:assert/strict');
module.exports=async({evaluate,navigate,clickButton,setFieldValue,waitFor,shot,api,sprint,member})=>{
 let last;
 for(let i=1;i<=26;i++)last=await api('/sprints/'+sprint.id+'/tasks/new',{title:'Pagination QA '+String(i).padStart(2,'0'),criteria:'All cards visible',taskCategory:'DEV',size:'SMALL',estimatedHours:1,readinessAcknowledged:true,reason:'Disposable QA',assignments:[{memberId:member.id,estimatedHours:1,supportOnly:false}]});
 const current=await api('/sprints/'+sprint.id),delivery=current.items.filter(t=>t.taskCategory!=='BAU');
 await navigate('sprints/'+sprint.id+'/board','İşlerin durumu');await waitFor('document.querySelectorAll(".board .task-card").length==='+delivery.length);
 assert(delivery.filter(t=>t.status==='todo').length>20);assert.equal(Number(await evaluate('document.querySelectorAll(".board app-list-pager").length')),0);
 assert.equal(Number(await evaluate('document.querySelectorAll(".board [data-status=todo] .task-card").length')),delivery.filter(t=>t.status==='todo').length);
 await setFieldValue('[name=boardQuery]','Pagination QA 26');await waitFor('document.querySelectorAll(".board .task-card").length===1');
 await evaluate('document.querySelector(".board .board-task-title").click()');await waitFor('!!document.querySelector(".board-detail")');assert(await evaluate('document.querySelector(".board-detail").innerText.includes("Pagination QA 26")'));await clickButton('Kapat');
 await setFieldValue('.board .task-card select','doing');await waitFor('document.querySelectorAll(".board [data-status=doing] .task-card").length===1');
 assert.equal((await api('/sprints/'+sprint.id)).items.find(t=>t.id===last.id).status,'doing');
 await clickButton('Filtreleri temizle');await waitFor('document.querySelectorAll(".board .task-card").length==='+delivery.length);
 await setFieldValue('[name=boardQuery]','no-match-pagination-qa');await waitFor('!!document.querySelector(".board-empty")');await clickButton('Tüm görevleri göster');await waitFor('document.querySelectorAll(".board .task-card").length==='+delivery.length);await shot('board-all-items');
 console.log('PASS: board shows all 20+ cards in one lane without pagination; filters, empty/reset, task detail and status update retained.');
};
