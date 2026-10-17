const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async({evaluate,command,navigate,clickButton,sleep})=>{
 const out='tmp/photo-size-ui';fs.mkdirSync(out,{recursive:true});
 async function waitFor(expression){for(let i=0;i<100;i++){if(await evaluate(expression))return;await sleep(100);}throw Error('Timeout '+expression);}
 const photo='data:image/png;base64,'+fs.readFileSync('assets/team-photos/huseyin-dogan.png').toString('base64');
 await evaluate(`(async()=>{const s=await fetch('/api/auth/session').then(r=>r.json());const r=await fetch('/api/team/legacy-member-huseyin/photo',{method:'PUT',headers:{'Content-Type':'application/json','X-CSRF-TOKEN':s.csrfToken},body:JSON.stringify({photoDataUrl:${JSON.stringify(photo)}})});if(!r.ok)throw Error('QA photo setup');})()`);
 await navigate('team','Takım ve roller');await waitFor('!!document.querySelector(".profile-portrait img")');
 async function shots(name,selector,size){for(const width of [1440,390,320]){
  await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});await sleep(250);
  assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),name+' overflow '+width);
  assert.equal(await evaluate(`Math.round(document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().width)`),size);
  assert(await evaluate('[...document.images].every(i=>i.complete&&i.naturalWidth>0)'));
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);
  fs.writeFileSync(out+'/'+name+'-'+width+'.png',Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'));
 }}
 await shots('team','.profile-portrait img',88);
 await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await navigate('sprints/legacy-sprint-14/review','Sprint 14');await waitFor('!!document.querySelector(".review-team-person img")');
 await shots('review','.review-team-person img',80);
 await evaluate(`window.photoSizeHtml='';const original=URL.createObjectURL;URL.createObjectURL=function(b){b.text().then(t=>window.photoSizeHtml=t);return original(b)};document.addEventListener('click',e=>{if(e.target.closest('a[download]'))e.preventDefault()},true)`);
 await clickButton('Sprint özeti HTML indir');await waitFor('!!window.photoSizeHtml');const html=await evaluate('window.photoSizeHtml');
 const slack=await evaluate("fetch('/api/admin/slack/digest/preview?sprintId=legacy-sprint-14').then(r=>r.json())");assert(slack.html);
 for(const [name,content,selector] of [['html',html,'.portrait-row img'],['slack',slack.html,'.person img']]){
  fs.writeFileSync(out+'/'+name+'.html',content);
  await command('Page.navigate',{url:'data:text/html;charset=utf-8,'+encodeURIComponent(content)});await sleep(300);
  await shots(name,selector,80);
  await command('Emulation.setDeviceMetricsOverride',{width:900,height:1100,deviceScaleFactor:1,mobile:false});await command('Emulation.setEmulatedMedia',{media:'print'});await sleep(150);
  assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));if(name==='html')assert.equal(await evaluate('document.querySelector(".portrait-row img").getBoundingClientRect().width'),64);
  await command('Emulation.setEmulatedMedia',{media:''});
 }
 console.log('PASS: team 88px, review + both HTML exports 80px, print 64px; 1440/390/320 no overflow and photos loaded. No Slack send.');
};
