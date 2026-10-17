const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async({evaluate,command,navigate,clickButton,setFieldValue,sleep,events})=>{
 async function wait(expr){for(let i=0;i<100;i++){if(await evaluate(expr))return;await sleep(100);}throw Error('Timeout '+expr+' '+await evaluate('document.body.innerText.slice(-1500)'));}
 async function api(url,body,method='POST'){return JSON.parse(await evaluate(`(async()=>{const s=await(await fetch('/api/auth/session')).json();const r=await fetch('/api'+${JSON.stringify(url)},{method:${JSON.stringify(body?method:'GET')},headers:{'Content-Type':'application/json','X-CSRF-TOKEN':s.csrfToken},${body?'body:JSON.stringify('+JSON.stringify(body)+'),':''}});const text=await r.text();if(!r.ok)throw Error(r.status+' '+text);return text||'{}';})()`));}
 async function login(user,password){await evaluate(`(async()=>{let s=await(await fetch('/api/auth/session')).json();await fetch('/logout',{method:'POST',body:new URLSearchParams({_csrf:s.csrfToken})});s=await(await fetch('/api/auth/session')).json();await fetch('/login',{method:'POST',body:new URLSearchParams({username:${JSON.stringify(user)},password:${JSON.stringify(password)},_csrf:s.csrfToken})});return true})()`);await command('Page.reload',{ignoreCache:true});await sleep(500);await wait('!!document.querySelector("main")');}
 async function click(selector){const p=JSON.parse(await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing '+${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2});})()`));await command('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await command('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});}
 const user='qa.leave.member',pass='Leave-UI-test-only-123';
 if(!(await api('/admin/users')).some(a=>a.username===user))await api('/admin/users',{username:user,password:pass});
 await api('/admin/users/'+user+'/member',{memberId:'legacy-member-elcim'},'PUT');
 const sprint=(await api('/sprints')).find(s=>s.status==='active');assert(sprint);
 const before=await api('/sprints/'+sprint.id+'/capacity'),cap=before.find(r=>r.memberId==='legacy-member-elcim');
 const count=(await api('/leaves')).length;
 await login(user,pass);await navigate('leaves','İzin taleplerim');await wait('!!document.querySelector("app-leave-requests")');
 assert(!await evaluate('[...document.querySelectorAll("button")].some(b=>b.innerText==="+ İzin ekle")'));
 await clickButton('+ İzin talebi');await setFieldValue('[name=leaveRequestSprint]',sprint.id);
 await setFieldValue('[name=leaveRequestStart]',sprint.start);await setFieldValue('[name=leaveRequestEnd]',sprint.start);
 await setFieldValue('[name=leaveRequestDays]','1');await setFieldValue('[name=leaveRequestReason]','QA izin <img src=x onerror=alert(1)>');
 fs.mkdirSync('tmp/leave-requests-ui',{recursive:true});
 await command('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:false});
 assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
 fs.writeFileSync('tmp/leave-requests-ui/request-390.png',Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'));
 await clickButton('Onaya gönder');await wait('!document.querySelector("[name=leaveRequestReason]")');
 assert.equal((await api('/leaves')).length,count);
 assert.deepEqual(await api('/sprints/'+sprint.id+'/capacity'),before);
 const request=(await api('/self/leave-requests')).find(r=>r.status==='PENDING');assert(request);
 assert(!await evaluate('!!document.querySelector("app-leave-requests img")'));
 await command('Emulation.clearDeviceMetricsOverride',{});
 await login(process.env.SPRINTBOARD_USERNAME,process.env.SPRINTBOARD_PASSWORD);await navigate('leaves','İzin talepleri');
 await wait(`!!document.querySelector('[data-request-id="${request.id}"]')`);
 assert(await evaluate('[...document.querySelectorAll("button")].some(b=>b.innerText==="+ İzin ekle")'));
 await click('[data-request-id="'+request.id+'"] footer button:last-child');
 await setFieldValue('[name=leaveDecisionNote]','Uygun, onaylandı');await clickButton('Kararı kaydet');
 await wait('document.querySelector("app-leave-requests")?.innerText.includes("Talep onaylandı")');
 const after=(await api('/sprints/'+sprint.id+'/capacity')).find(r=>r.memberId==='legacy-member-elcim');
 assert.equal(after.availableHours,cap.availableHours-cap.hoursPerDay);assert.equal(after.plannedHours,cap.plannedHours);
 assert.equal((await api('/leaves')).length,count+1);
 await setFieldValue('app-leave-requests .journal-filters select','APPROVED');
 await wait(`!!document.querySelector('[data-request-id="${request.id}"]')`);
 assert(await evaluate(`document.querySelector('[data-request-id="${request.id}"]').innerText.includes('Onaylandı')`));
 // Cancel does not submit a second request.
 await login(user,pass);await navigate('leaves','İzin taleplerim');await clickButton('+ İzin talebi');await clickButton('Vazgeç');assert.equal((await api('/self/leave-requests')).length,1);
 await login(process.env.SPRINTBOARD_USERNAME,process.env.SPRINTBOARD_PASSWORD);
 const current=await api('/sprints/'+sprint.id);
 const dev=current.items.filter(t=>t.taskCategory==='DEV');
 if(dev.length>1){await api('/tasks/'+dev[0].id,{status:'done'},'PATCH');await api('/tasks/'+dev[1].id,{status:'doing'},'PATCH');}
 await navigate('sprints/'+sprint.id+'/review','Sprintin şu anki fotoğrafı');await wait('!!document.querySelector(".review-completion-track")');
 const bars=JSON.parse(await evaluate('JSON.stringify([...document.querySelectorAll(".review-completion-track")].map(e=>({percent:Number(e.getAttribute("aria-valuenow")),fill:e.firstElementChild.getBoundingClientRect().width,total:e.clientWidth,text:e.closest("article").innerText})))'));
 assert(bars.some(b=>b.percent===100&&b.text.includes('BAU')));
 assert(bars.some(b=>b.percent===0));assert(bars.some(b=>b.percent>0&&b.percent<100));
 for(const b of bars)assert(Math.abs(b.fill-b.total*b.percent/100)<1.1,JSON.stringify(b));
 for(const width of [1440,390]){
   await command('Emulation.setDeviceMetricsOverride',{width,height:950,deviceScaleFactor:1,mobile:false});
   await evaluate('document.querySelector(".review-type-progress").closest("section").scrollIntoView({block:"start"});window.scrollBy(0,-85)');await sleep(120);
   assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
   fs.writeFileSync('tmp/leave-requests-ui/progress-'+width+'.png',Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'));
 }
 assert.equal(events.length,0,events.join('\n'));
 console.log('Leave/Review UI PASS: linked user request, no pending effect, admin approval and immediate refresh, exact capacity reduction, assignments preserved, admin direct action, cancel, escaped reason, 0/partial/100% bars without gap, desktop/mobile.');
};
