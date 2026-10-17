module.exports=async({evaluate,command,navigate,clickButton,setFieldValue,sleep,events})=>{
 const assert=require('node:assert/strict'),fs=require('node:fs');
 async function wait(expr){for(let i=0;i<100;i++){if(await evaluate(expr))return;await sleep(100);}throw Error('Timeout '+expr);}
 async function open(text){await evaluate(`Array.from(document.querySelectorAll('app-slack-overtime-inbox .entry-head')).find(e=>e.textContent.includes(${JSON.stringify(text)})).click()`);await wait('!!document.querySelector("app-slack-overtime-inbox .entry-body")');}
 const members=JSON.parse(await evaluate("fetch('/api/team').then(r=>r.json()).then(JSON.stringify)"));const member=members.find(m=>m.active);
 const before=JSON.parse(await evaluate("fetch('/api/overtime/entries').then(r=>r.json()).then(JSON.stringify)"));
 await navigate('settings','Ayarlar');await wait('!!document.querySelector("[name=slackOvertimeChannel]")');assert.equal(await evaluate('document.querySelector("[name=slackOvertimeChannel]").value'),'C0CA3PMA1Q9');
 await clickButton('Ayarları kaydet','app-slack-settings button');await wait('document.querySelector("app-slack-settings .inline-success")?.textContent.includes("kaydedildi")');
 await navigate('overtime','Fazla mesai');await wait('document.querySelectorAll("app-slack-overtime-inbox article").length===3');
 await open('QA mesai');assert(!await evaluate('document.querySelector("app-slack-overtime-inbox").innerText.includes("UTEST123")'));
 await clickButton('Vazgeç','app-slack-overtime-inbox button');await wait('!document.querySelector("app-slack-overtime-inbox .entry-body")');await open('QA mesai');
 assert.equal(await evaluate('document.querySelector("[aria-label$=üyesi]").value'),'');
 await setFieldValue('[aria-label="Mesai ekip üyesi"]',member.id);await setFieldValue('[aria-label="Mesai karar notu"]','QA çalışma doğrulandı');
 await evaluate('document.querySelector("[type=checkbox]").click()');await sleep(150);
 assert.equal(await evaluate('document.querySelector("[aria-label$=sprinti]").value'),'qa-ot-sprint');
 fs.mkdirSync('tmp/slack-overtime-ui-shots',{recursive:true});
 for(const width of [1440,390]){await command('Emulation.setDeviceMetricsOverride',{width,height:1100,deviceScaleFactor:1,mobile:false});await sleep(200);await evaluate('document.querySelector("app-slack-overtime-inbox").scrollIntoView({block:"start"});window.scrollBy(0,-85)');assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));fs.writeFileSync('tmp/slack-overtime-ui-shots/inbox-'+width+'.png',Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'));}
 await command('Emulation.clearDeviceMetricsOverride',{});await clickButton('Onayla ve hakedişe ekle','app-slack-overtime-inbox button');await wait('document.querySelector("app-slack-overtime-inbox .inline-success")?.textContent.includes("onaylandı")');
 const after=JSON.parse(await evaluate("fetch('/api/overtime/entries').then(r=>r.json()).then(JSON.stringify)"));const added=after.filter(a=>!before.some(b=>b.id===a.id));assert.equal(added.length,1);assert.equal(added[0].earnedHours,2.5);assert.equal(added[0].plannedHours,0);assert.equal(added[0].includeInCapacity,false);
 await open('QA ikinci mesai');assert.equal(await evaluate('document.querySelector("[aria-label$=üyesi]").value'),member.id);await setFieldValue('[aria-label="Mesai karar notu"]','QA red');await clickButton('Reddet','app-slack-overtime-inbox button');await wait('document.querySelectorAll("app-slack-overtime-inbox article").length===1');
 await open('Format hatası');assert(!await evaluate('document.querySelector("app-slack-overtime-inbox .entry-body").innerText.includes("Onayla ve hakedişe ekle")'));await setFieldValue('[aria-label="Mesai karar notu"]','Eksik format');await clickButton('Reddet','app-slack-overtime-inbox button');await wait('document.querySelectorAll("app-slack-overtime-inbox article").length===0');
 assert.equal(JSON.parse(await evaluate("fetch('/api/overtime/entries').then(r=>r.json()).then(JSON.stringify)")).length,after.length);
 await setFieldValue('select[aria-label="Slack mesai görünümü"]','APPROVED');await wait('document.querySelectorAll("app-slack-overtime-inbox article").length===1');
 assert.equal(events.length,0,events.join('\n'));console.log('Slack overtime UI PASS: configuration, identity mapping, approve/reject/cancel, ledger refresh, invalid format, safe text, desktop/mobile.');
};
