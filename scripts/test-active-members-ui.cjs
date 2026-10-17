const assert=require('node:assert/strict');
module.exports=async({evaluate,navigate,clickButton,sleep,events})=>{
 async function waitFor(e){for(let i=0;i<80;i++){if(await evaluate(e))return;await sleep(100);}throw Error('Timeout '+e);}
 const members=JSON.parse(await evaluate("fetch('/api/team').then(r=>r.json()).then(JSON.stringify)"));const leaves=JSON.parse(await evaluate("fetch('/api/leaves').then(r=>r.json()).then(JSON.stringify)"));const active=members.filter(m=>Number(m.active)===1),inactive=members.filter(m=>Number(m.active)!==1);assert(inactive.length>0);
 const before=await evaluate("fetch('/api/export').then(r=>r.json()).then(x=>JSON.stringify(x.tables))");
 await navigate('overtime','Kişi mesaileri');await waitFor('document.querySelectorAll(".overtime-person").length>0');const names=await evaluate('[...document.querySelectorAll(".person-identity strong")].map(n=>n.textContent)');assert.equal(names.length,active.length);for(const p of inactive)assert(!names.includes(p.name));
 await clickButton('+ Mesai kaydı');const ids=await evaluate('[...document.querySelectorAll("[name=memberId] option")].map(n=>n.value)');for(const p of inactive)assert(!ids.includes(p.id));await clickButton('Vazgeç');
 await navigate('leaves','Kişi izinleri');await waitFor('document.querySelectorAll(".filter-toolbar select:first-of-type option").length>1');await sleep(350);
 const expected=leaves.filter(l=>active.some(m=>m.id===l.memberId)).reduce((s,l)=>s+l.days,0);assert.equal(await evaluate('document.querySelector(".mini-metrics strong").textContent.trim()'),expected+' gün');
 const labels=await evaluate('[...document.querySelectorAll(".person-accordion-name strong")].map(n=>n.textContent)');for(const p of inactive)assert(!labels.includes(p.name));
 const options=await evaluate('[...document.querySelectorAll(".filter-toolbar select:first-of-type option")].map(n=>n.value)');for(const p of inactive)assert(!options.includes(p.id));
 await clickButton('+ İzin ekle');const leaveIds=await evaluate('[...document.querySelectorAll("[name=memberId] option")].map(n=>n.value)');for(const p of inactive)assert(!leaveIds.includes(p.id));await clickButton('Vazgeç');
 assert.equal(await evaluate("fetch('/api/export').then(r=>r.json()).then(x=>JSON.stringify(x.tables))"),before);assert.equal(events.length,0,events.join('\n'));console.log('Active-member UI PASS: overtime rows, leave groups/totals, filters and both create forms exclude inactive members; full source data unchanged.');
};
