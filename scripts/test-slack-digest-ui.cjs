module.exports=async({evaluate,command,navigate,clickButton,setFieldValue,sleep,events})=>{
 const assert=require('node:assert/strict'),fs=require('node:fs');
 await navigate('settings','Yedekleme ve geri yükleme');
 await evaluate("[...document.querySelectorAll('.settings-section summary')].find(e=>e.textContent.includes('Slack')).click()");
 for(let i=0;i<80&&!await evaluate('!!document.querySelector("app-slack-digest-settings input[name=channel]")');i++)await sleep(100);
 assert.equal(await evaluate('document.querySelector("app-slack-digest-settings input[name=time]").value'),'08:00');
 await setFieldValue('app-slack-digest-settings input[name=channel]','C0CA4QFAU49');
 await clickButton('Gönderim ayarlarını kaydet','app-slack-digest-settings button');await sleep(300);
 const status=await evaluate("fetch('/api/admin/slack/digest').then(r=>r.json())");assert.equal(status.enabled,false);assert.equal(status.channelId,'C0CA4QFAU49');
 fs.mkdirSync('tmp/slack-digest-ui',{recursive:true});
 for(const width of [1440,390]){await command('Emulation.setDeviceMetricsOverride',{width,height:1100,deviceScaleFactor:1,mobile:false});await sleep(200);await evaluate('document.querySelector("app-slack-digest-settings").scrollIntoView({block:"start"});window.scrollBy(0,-85)');assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));fs.writeFileSync('tmp/slack-digest-ui/settings-'+width+'.png',Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'));}
 await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 const sprints=await evaluate("fetch('/api/sprints').then(r=>r.json())");const selected=sprints.find(s=>s.status==='completed'&&s.number===12)||sprints.find(s=>s.status==='completed');assert(selected);
 await navigate('sprints/'+selected.id+'/review',selected.name);
 await clickButton('Slack’e gönder','app-sprint-review app-slack-review-send button');
 for(let i=0;i<80&&!await evaluate('!!document.querySelector("app-sprint-review app-slack-review-send [role=group]")');i++)await sleep(100);
 assert(await evaluate('document.querySelector("app-sprint-review app-slack-review-send").innerText.includes('+JSON.stringify(selected.name)+')'));
 await clickButton('Vazgeç','app-sprint-review app-slack-review-send button');
 for(let i=0;i<40&&await evaluate('!!document.querySelector("app-sprint-review app-slack-review-send [role=group]")');i++)await sleep(100);
 fs.writeFileSync('tmp/slack-digest-ui/cancel-debug.png',Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'));
 assert(!await evaluate('!!document.querySelector("app-sprint-review app-slack-review-send [role=group]")'));
 // QA uses a token-free database: exercise error display without contacting Slack.
 await clickButton('Slack’e gönder','app-sprint-review app-slack-review-send button');await clickButton('Özeti ve HTML’i gönder','app-sprint-review app-slack-review-send button');
 for(let i=0;i<80&&!await evaluate('document.querySelector("app-sprint-review app-slack-review-send").innerText.includes("Hata:")');i++)await sleep(100);
 assert(await evaluate('document.querySelector("app-sprint-review app-slack-review-send").innerText.includes("Hata:")'));
 const after=await evaluate("fetch('/api/admin/slack/digest').then(r=>r.json())");assert.equal(after.history[0].sprintName,selected.name);assert.equal(after.history[0].state,'FAILED');
 const preview=await evaluate("fetch('/api/admin/slack/digest/preview?sprintId="+encodeURIComponent(selected.id)+"').then(r=>r.json())");assert(preview.html.includes(selected.name));assert(preview.html.includes('GÖRELİ TAHMİN'));fs.writeFileSync('tmp/slack-digest-ui/review.html',preview.html);
 await command('Page.navigate',{url:'data:text/html;charset=utf-8,'+encodeURIComponent(preview.html)});await sleep(300);
 for(const width of [1440,390]){await command('Emulation.setDeviceMetricsOverride',{width,height:1100,deviceScaleFactor:1,mobile:false});await sleep(200);assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));fs.writeFileSync('tmp/slack-digest-ui/review-'+width+'.png',Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'));}
 for(const section of ['overtime-people','sprint-leaves']){assert(await evaluate('!!document.querySelector(\'[data-section="'+section+'"]\')'));for(const width of [1440,390]){await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});await evaluate('document.querySelector(\'[data-section="'+section+'"]\').scrollIntoView({block:"start"})');await sleep(150);assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));fs.writeFileSync('tmp/slack-digest-ui/'+section+'-'+width+'.png',Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'));}}
 assert.equal(events.length,0,events.join('\n'));console.log('Slack digest UI PASS: settings/save, review admin confirmation/cancel, selected closed sprint, safe error, HTML, 1440/390px no overflow; no Slack message sent.');
};
