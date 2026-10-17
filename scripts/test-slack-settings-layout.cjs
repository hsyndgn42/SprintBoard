module.exports=async({evaluate,command,navigate,clickButton,setFieldValue,sleep,events})=>{
 const assert=require('node:assert/strict'),fs=require('node:fs');
 await navigate('settings','Yedekleme ve geri yükleme');
 await evaluate("[...document.querySelectorAll('.settings-section summary')].find(e=>e.textContent.includes('Slack')).click()");
 for(let i=0;i<80;i++){if(await evaluate('!!document.querySelector("[name=slackTeam]")'))break;await sleep(100);}
 assert.equal(await evaluate('document.querySelectorAll("app-slack-settings a").length'), '');
 assert.equal(await evaluate('document.querySelectorAll(".template-card").length'),2);
 assert(await evaluate('document.querySelector("#slack-overtime-template").readOnly'));
 assert(!await evaluate('document.querySelector("#slack-defect-template").readOnly'));
 await setFieldValue('[name=slackTeam]','TLAYOUT123');
 await setFieldValue('[name=slackChannel]','CLAYOUT123');
 await setFieldValue('[name=slackOvertimeChannel]','COVERTIME123');
 await clickButton('Ayarları kaydet','app-slack-settings button');
 for(let i=0;i<80;i++){if(await evaluate('document.querySelector("app-slack-settings .inline-success")?.textContent.includes("kaydedildi")'))break;await sleep(100);}
 assert(await evaluate('document.querySelector("app-slack-settings .inline-success")?.textContent.includes("kaydedildi")'));
 await evaluate('document.querySelector(".advanced-settings summary").click()');
 await clickButton('Tokenları sil','app-slack-settings button');
 await clickButton('Vazgeç','app-slack-settings button');
 assert(!await evaluate('document.querySelector(".advanced-settings .notice")?.textContent.includes("silinsin")'));
 await evaluate('document.querySelector(".advanced-settings summary").click()');
 fs.mkdirSync('tmp/slack-layout-qa',{recursive:true});
 for(const width of [1440,390]){
  await command('Emulation.setDeviceMetricsOverride',{width,height:1100,deviceScaleFactor:1,mobile:false});await sleep(250);
  await evaluate('document.querySelector("app-slack-settings").scrollIntoView({block:"start"});window.scrollBy(0,-85)');
  assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
  assert(await evaluate('(()=>{const r=[...document.querySelectorAll(".save-actions .btn")].map(x=>x.getBoundingClientRect());return Math.abs(r[0].height-r[1].height)<1})()'));
  assert(await evaluate('(()=>{const r=[...document.querySelectorAll(".template-card")].map(x=>x.getBoundingClientRect());return innerWidth>700?Math.abs(r[0].top-r[1].top)<1:r[1].top>=r[0].bottom})()'));
  fs.writeFileSync('tmp/slack-layout-qa/settings-'+width+'.png',Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'));
 }
 assert.equal(events.length,0,events.join('\n'));
 console.log('Slack layout PASS: no navigation links, paired templates, save/cancel, responsive columns, equal buttons, no overflow.');
};
