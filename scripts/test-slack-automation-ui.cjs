// Disposable QA database only. No real Slack messages are sent by this test.
const assert=require('node:assert/strict');
module.exports=async({evaluate,command,navigate,clickButton,setFieldValue,api,waitFor,shot,sleep})=>{
 assert.equal(new URL(process.env.SPRINTBOARD_BASE_URL).port,'4183');
 await navigate('settings','Ayarlar');await waitFor('!!document.querySelector("app-slack-automation [data-section=slack-weekly]")');
 await evaluate('document.querySelector("app-slack-settings").closest("details").open=true;document.querySelectorAll("app-slack-automation details").forEach(d=>d.open=true)');
 assert(await evaluate('[...document.querySelectorAll("app-slack-automation details.section-fold")].every(d=>parseFloat(getComputedStyle(d).paddingLeft)>=18)'), 'Disclosure headers share card padding');
 const initial=await api('/admin/slack/weekly');assert.equal(initial.weekday,1);assert.equal(initial.sendTime,'09:00');assert.equal(initial.workerEnabled,false);
 await evaluate('(()=>{const s=document.querySelector("app-slack-automation select");s.selectedIndex=1;s.dispatchEvent(new Event("change",{bubbles:true}))})()');
 await setFieldValue('app-slack-automation input[type=time]','10:15');await clickButton('Rapor ayarlarını kaydet');
 await waitFor('document.querySelector("app-slack-automation").innerText.includes("ayarları kaydedildi")');
 const saved=await api('/admin/slack/weekly');assert.equal(saved.enabled,false);assert.equal(saved.sendTime,'10:15');
 const preview=await api('/admin/slack/weekly/preview');assert(preview.html.includes('Güncel bakiye'));assert(preview.html.includes('planlı mesai hakedişe eklenmez'));assert.equal(saved.history.length,0);
 // The configured fake channel comes from earlier Slack form regression. No worker is running.
 const config=await api('/admin/slack');
 await api('/admin/slack/start',{...config,overtimeChannelId:'COT12345',botToken:'xoxb-fake-test-token',appToken:'xapp-fake-test-token'});
 await evaluate('document.querySelectorAll("app-slack-automation .ui-refresh")[1].click()');
 await waitFor('!document.querySelector("[data-section=slack-history] .primary").disabled');
 await setFieldValue('[data-section=slack-history] input[type=date]','2026-10-12');
 await setFieldValue('[data-section=slack-history] .field:last-child input[type=date]','2026-10-18');
 await evaluate('document.querySelector("[data-section=slack-history] .primary").click()');await waitFor('document.querySelector("app-slack-automation").innerText.includes("Tarama sıraya alındı")');
 const history=await api('/admin/slack/history');assert.equal(history.history.filter(r=>r.SOURCE==='MANUAL').length,3);assert(history.history.every(r=>r.STATE==='PENDING'));
 await evaluate('document.querySelector("[data-section=slack-weekly] .actions button:nth-child(3)").click()');await waitFor('document.querySelector("app-slack-automation").innerText.includes("Kanal üyeleri bu bilgileri görebilir")');await clickButton('Vazgeç','app-slack-automation button');await waitFor('!document.querySelector("app-slack-automation").innerText.includes("Kanal üyeleri bu bilgileri görebilir")');assert.equal((await api('/admin/slack/weekly')).history.length,0);
 for(const width of [1440,390]){await command('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:false});await evaluate('document.querySelector("app-slack-automation").scrollIntoView({block:"start"})');await sleep(150);assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));await shot('slack-automation-'+width);}
 await command('Emulation.clearDeviceMetricsOverride',{});
 console.log('PASS: weekly settings save, private preview, manual-send confirmation/cancel, queued history scan and responsive settings. No Slack publication.');
};
