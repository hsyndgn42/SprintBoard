const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async({evaluate,command,navigate,clickButton,setFieldValue,sleep,events})=>{
 async function api(path,body){return JSON.parse(await evaluate(`(async()=>{const session=await(await fetch('/api/auth/session')).json();const r=await fetch('/api'+${JSON.stringify(path)},${body?`{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-TOKEN':session.csrfToken},body:JSON.stringify(${JSON.stringify(body)})}`:'{}'});if(!r.ok)throw Error(await r.text());return JSON.stringify(await r.json())})()`));}
 async function waitFor(e){for(let i=0;i<100;i++){if(await evaluate(e))return;await sleep(100);}throw Error('Timeout '+e+' / '+await evaluate('document.querySelector(".modal")?.innerText||""'));}
 const qaName='Hakediş QA '+Date.now();
 const member=(await api('/team',{name:qaName,engagement:'CORE',teamRole:'DEVELOPER'})).id;
 const sprint=(await api('/sprints',{name:'İzin QA Sprint',start:'2027-06-07',end:'2027-06-25'})).id;
 const bal=async()=> (await api('/overtime/balances')).find(r=>r.memberId===member).balanceHours;
 const cap=async()=> (await api('/sprints/'+sprint+'/capacity')).find(r=>r.memberId===member).availableHours;
 const records=async()=> (await api('/leaves')).filter(r=>r.memberId===member);
 await navigate('overtime','Fazla mesai');await clickButton('+ Mesai kaydı');await setFieldValue('[name=memberId]',member);await setFieldValue('[name=sprintId]',sprint);await setFieldValue('[name=earnedHours]','24');
 assert(await evaluate('!document.querySelector("[name=usedHours]")'));
 await clickButton('Kaydet');await waitFor('!document.querySelector(".modal")');assert.equal(await bal(),24);
 await navigate('leaves','Kişi izinleri');await clickButton('+ İzin ekle');assert(await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.includes("İzni kaydet")).disabled'));
 await waitFor(`[...document.querySelectorAll('[name=memberId] option')].some(o=>o.value===${JSON.stringify(member)})&&[...document.querySelectorAll('[name=sprintId] option')].some(o=>o.value===${JSON.stringify(sprint)})`);
 await setFieldValue('[name=memberId]',member);await setFieldValue('[name=sprintId]',sprint);await setFieldValue('[name=leaveType]','ANNUAL');await clickButton('İzni kaydet');await waitFor('!document.querySelector(".modal")');assert.equal(await bal(),24);const initialCap=await cap();
 async function openEdit(){await waitFor(`[...document.querySelectorAll('details')].some(d=>d.querySelector('summary').textContent.includes(${JSON.stringify(qaName)}))`);await evaluate(`(()=>{const d=[...document.querySelectorAll('details')].find(d=>d.querySelector('summary').textContent.includes(${JSON.stringify(qaName)}));d.open=true;[...d.querySelectorAll('button')].find(b=>b.textContent.includes('Düzenle')).click()})()`);await waitFor('!!document.querySelector(".modal")');}
 await openEdit();await setFieldValue('[name=leaveType]','OVERTIME');await setFieldValue('[name=days]','2');await clickButton('İzni kaydet');await waitFor('!document.querySelector(".modal")');assert.equal(await bal(),8);assert.equal(await cap(),initialCap-8);assert.equal((await records())[0].overtimeHours,16);
 await openEdit();await setFieldValue('[name=days]','1');await clickButton('İzni kaydet');await waitFor('!document.querySelector(".modal")');assert.equal(await bal(),16);
 await openEdit();await setFieldValue('[name=days]','3');await clickButton('Vazgeç');await waitFor('!document.querySelector(".modal")');assert.equal((await records())[0].days,1);assert.equal(await bal(),16);
 await openEdit();await setFieldValue('[name=days]','4');await clickButton('İzni kaydet');await waitFor('document.querySelector(".modal")?.textContent.includes("Yeterli mesai hakedişi yok")');assert.equal(await bal(),16);assert.equal((await records())[0].days,1);await clickButton('Vazgeç');
 fs.mkdirSync('tmp/leave-ledger-ui',{recursive:true});
 for(const width of [1440,390]){
  await command('Emulation.setDeviceMetricsOverride',{width,height:950,deviceScaleFactor:1,mobile:false});await sleep(350);
  for(const route of ['leaves','overtime']){
   await navigate(route,route==='leaves'?'Kişi izinleri':'Fazla mesai');
   if(route==='leaves'){
    await waitFor(`[...document.querySelectorAll('details')].some(d=>d.querySelector('summary').textContent.includes(${JSON.stringify(qaName)}))`);
    await evaluate(`(()=>{const d=[...document.querySelectorAll('details')].find(d=>d.querySelector('summary').textContent.includes(${JSON.stringify(qaName)}));d.open=true;d.scrollIntoView({block:'center'})})()`);
   }else{
    await waitFor('document.querySelectorAll(".overtime-person").length>0');await setFieldValue('.overtime-search input',qaName);
    await evaluate('document.querySelector(".overtime-person").click()');await waitFor('!!document.querySelector(".overtime-detail")');
   }
   await sleep(350);assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
   const shot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync('tmp/leave-ledger-ui/'+route+'-'+width+'.png',Buffer.from(shot.data,'base64'));
   if(route==='overtime'){await clickButton('Kapat');await waitFor('!document.querySelector(".modal")');}
  }
  await navigate('leaves','Kişi izinleri');await openEdit();assert(await evaluate('document.querySelector(".modal header").getBoundingClientRect().top>=0'));const shot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync('tmp/leave-ledger-ui/form-'+width+'.png',Buffer.from(shot.data,'base64'));await clickButton('Vazgeç');
 }
 await openEdit();await setFieldValue('[name=leaveType]','ANNUAL');await clickButton('İzni kaydet');await waitFor('!document.querySelector(".modal")');assert.equal(await bal(),24);
 await navigate('overtime','Fazla mesai');assert(await evaluate('document.body.textContent.includes("TOPLAM MESAİ")'));
 assert.equal(events.filter(e=>e.startsWith('400 ')&&e.includes('/api/leaves/')).length,1);assert(events.every(e=>e.includes('400')&&(e.includes('/api/leaves/')||e.startsWith('Failed to load resource:'))),events.join('\n'));
 console.log('Leave ledger UI PASS: annual/create/edit/compensatory refund/cancel/insufficient funds, no manual double usage, persisted API amounts/capacity, 1440/390px screenshots.');
};
