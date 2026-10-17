const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async({evaluate,command,navigate,sleep,events})=>{
 async function waitFor(e){for(let i=0;i<80;i++){if(await evaluate(e))return;await sleep(100);}throw Error('Timeout '+e);}
 const data=JSON.parse(await evaluate("fetch('/api/overview').then(r=>r.json()).then(JSON.stringify)"));
 await navigate('overview','VIBE Craft');await waitFor('!!document.querySelector(".history-panel")');
 assert.equal(await evaluate('document.querySelector("h1").textContent'),'VIBE Craft Overview');
 assert.equal(await evaluate('document.querySelector(".overview-metrics strong").textContent'),String(data.totalSprints));
 assert(await evaluate('!document.querySelector(".capacity-method").open'));
 assert(await evaluate('!document.querySelector("main").textContent.includes("Ölçüm ilkesi")'));
 fs.mkdirSync('tmp/overview-ui',{recursive:true});
 for(const width of [1440,800,390]){
  await command('Emulation.setDeviceMetricsOverride',{width,height:1100,deviceScaleFactor:1,mobile:false});await sleep(400);
  assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
  await evaluate('window.scrollTo(0,0)');const shot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync('tmp/overview-ui/overview-'+width+'.png',Buffer.from(shot.data,'base64'));
 }
 await evaluate('document.querySelector(".capacity-method summary").click()');assert(await evaluate('document.querySelector(".capacity-method").open'));
 for(const [selector,hash] of [['.board-link','/board'],['.sprint-capacity','/capacity'],['.history-row','/summary'],['.shortcut[href="#/roadmap"]','/roadmap'],['.shortcut[href="#/backlog"]','/backlog'],['.shortcut[href="#/team"]','/team'],['.overview-heading a','/reports']]){
  await navigate('overview','VIBE Craft');await waitFor('!!document.querySelector(".history-panel")');await evaluate('document.querySelector('+JSON.stringify(selector)+').click()');await waitFor('location.hash.endsWith('+JSON.stringify(hash)+')');
 }
 // Read-only response fixtures: empty and active-with-no-delivery, without touching H2.
 await evaluate('window.qaOverview='+JSON.stringify({...data,totalSprints:0,completedSprints:0,deliveredTasks:0,undoneTasks:0,deliveryRate:null,activeSprint:null,recentSprints:[]})+';window.qaOpen=XMLHttpRequest.prototype.open;window.qaSend=XMLHttpRequest.prototype.send;XMLHttpRequest.prototype.open=function(method,url,...args){this.qaUrl=String(url);return window.qaOpen.call(this,method,url,...args)};XMLHttpRequest.prototype.send=function(...args){if(!this.qaUrl.endsWith("/api/overview"))return window.qaSend.apply(this,args);const body=JSON.stringify(window.qaOverview);setTimeout(()=>{for(const [key,value] of Object.entries({status:200,statusText:"OK",readyState:4,response:this.responseType==="json"?JSON.parse(body):body,responseText:body}))Object.defineProperty(this,key,{configurable:true,value});this.dispatchEvent(new ProgressEvent("load"));},20)}');
 await navigate('overview','Aktif sprint yok');await waitFor('document.querySelector(".history-panel").textContent.includes("Henüz tamamlanan sprint yok")');
 assert(!(await evaluate('!!document.querySelector(".sprint-capacity")')));assert(await evaluate('document.querySelector(".overview-metrics").textContent.includes("—")'));
 await navigate('team','Takım ve roller');await evaluate('window.qaOverview='+JSON.stringify({...data,activeSprint:{...data.activeSprint,deliveryTaskCount:0,deliveryDoneCount:0,goal:'Çok uzun bir sprint hedefi '.repeat(30)}}));
 await navigate('overview','VIBE Craft');await waitFor('!!document.querySelector(".active-progress")');assert.equal(await evaluate('document.querySelector(".active-progress b").textContent'),'—');assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
 await evaluate('XMLHttpRequest.prototype.open=window.qaOpen;XMLHttpRequest.prototype.send=window.qaSend');
 assert.equal(events.length,0,events.join('\n'));
 console.log('Overview UI PASS: 1440/800/390 px, real API metrics, seven links, disclosure, empty state, no-delivery/long goal and no browser errors.');
};
