// Real settings, encrypted persistence and inbox decisions on disposable QA DB. Never connect to Slack.
module.exports=async({evaluate,command,navigate,clickButton,setFieldValue,sleep,events,ws})=>{
 const assert=require('node:assert/strict'),fs=require('node:fs');
 async function wait(expr){for(let i=0;i<80;i++){if(await evaluate(expr))return;await sleep(100);}throw Error('Timeout: '+expr);}
 async function click(selector){const p=JSON.parse(await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2})})()`));await command('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await command('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});}
 async function choose(selector,value){await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await sleep(150);}
 async function api(path,body,method='POST'){return JSON.parse(await evaluate(`(async()=>{const session=await fetch('/api/auth/session').then(r=>r.json());const r=await fetch('/api${path}',{method:${JSON.stringify(method)},headers:{'Content-Type':'application/json','X-CSRF-TOKEN':session.csrfToken},body:JSON.stringify(${JSON.stringify(body)})});return JSON.stringify({status:r.status,body:await r.json()});})()`));}
 const before=JSON.parse(await evaluate("fetch('/api/export').then(r=>r.json()).then(x=>JSON.stringify(x.tables))"));
 await navigate('settings','Ayarlar');await wait('!!document.querySelector("app-slack-settings input")');
 assert.equal(await evaluate('document.querySelector("[name=slackBotToken]").type'),'password');
 await setFieldValue('[name=slackTeam]','TTEST123');await setFieldValue('[name=slackChannel]','CTEST123');
 await setFieldValue('[name=slackBotToken]','xoxb-ui-test-only-123456789');await setFieldValue('[name=slackAppToken]','xapp-ui-test-only-123456789');
 await clickButton('Ayarları kaydet','app-slack-settings button');await wait('document.querySelector("app-slack-settings .inline-success")?.innerText.includes("kaydedildi")');
 assert.equal(await evaluate('document.querySelector("[name=slackBotToken]").value'),'');
 await navigate('backlog','Backlog');await navigate('settings','Ayarlar');await wait('document.querySelector("[name=slackBotToken]")?.placeholder.startsWith("Kaydedildi")');
 assert.equal(await evaluate('document.querySelector("[name=slackTeam]").value'),'TTEST123');
 const template=await evaluate('document.querySelector("[name=slackTemplate]").value');assert(!template.includes('Adımlar'));
 const sample='#defect\nTür: TEST\nBaşlık: QA\nOrtam: SAT\nÖnem: HIGH\nHedef: BACKLOG';
 assert.equal((await api('/admin/slack/parse',{text:sample})).body.valid,true);
 await setFieldValue('[name=slackTemplate]',template.replace('SAT,SIT,UAT,DEV,PROD','SIT,UAT'));
 await clickButton('Ayarları kaydet','app-slack-settings button');await sleep(300);
 assert.equal((await api('/admin/slack/parse',{text:sample})).body.valid,false);
 await setFieldValue('[name=slackTemplate]',template);await clickButton('Ayarları kaydet','app-slack-settings button');await sleep(300);
 assert(!await evaluate('JSON.stringify(localStorage).includes("xoxb-ui")||JSON.stringify(sessionStorage).includes("xapp-ui")'));
 fs.mkdirSync('tmp/slack-approval-ui',{recursive:true});
 async function screenshots(name,selector){for(const width of [1440,390]){await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});await sleep(250);if(width===390&&await evaluate('document.querySelector(".sidebar")?.classList.contains("open")')){await click('.nav-close');await sleep(200);}await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'start'});window.scrollBy(0,-85)`);assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));fs.writeFileSync('tmp/slack-approval-ui/'+name+'-'+width+'.png',Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'));}await command('Emulation.clearDeviceMetricsOverride',{});}
 await screenshots('settings','app-slack-settings');await sleep(500);
 await clickButton('Tokenları sil','app-slack-settings button');await clickButton('Vazgeç','app-slack-settings button');assert(await evaluate('document.querySelector("[name=slackBotToken]").placeholder.startsWith("Kaydedildi")'));
 await clickButton('Tokenları sil','app-slack-settings button');await clickButton('Evet, tokenları sil','app-slack-settings button');await wait('document.querySelector("[name=slackBotToken]")?.placeholder==="xoxb-…"');
 await navigate('backlog','Backlog');await wait('document.querySelectorAll("app-slack-inbox .entry").length===3');
 async function open(title){await clickButton(title,'app-slack-inbox .entry-head');await wait('!!document.querySelector("app-slack-inbox .entry-body")');}
 // Header includes metadata, locate by title without relying on the full composed label.
 async function openTitle(title){const selector=await evaluate(`(()=>{const list=[...document.querySelectorAll('app-slack-inbox .entry-head')];const n=list.findIndex(e=>e.querySelector('strong')?.textContent===${JSON.stringify(title)});return 'app-slack-inbox .entry:nth-of-type('+(n+1)+') .entry-head';})()`);await click(selector);await wait('!!document.querySelector("app-slack-inbox .entry-body")');}
 await openTitle('QA Slack Backlog');await screenshots('inbox','app-slack-inbox');
 // Select by field label: target and Size live in separate labels.
 await evaluate("(()=>{const e=[...document.querySelectorAll('app-slack-inbox label')].find(l=>l.textContent.startsWith('Size')).querySelector('select');e.value='SMALL';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
 await clickButton('Onayla ve backlog’a ekle','app-slack-inbox button');await wait('document.querySelectorAll("app-slack-inbox .entry").length===2');
 await openTitle('QA Slack Sprint');
 await evaluate("(()=>{const e=[...document.querySelectorAll('app-slack-inbox label')].find(l=>l.textContent.startsWith('Size')).querySelector('select');e.value='MEDIUM';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
 assert(await evaluate('[...document.querySelectorAll("app-slack-inbox button")].find(e=>e.innerText.includes("Onayla ve")).disabled'));
 await click('app-slack-inbox .confirm input');await clickButton('Onayla ve sprinte ekle','app-slack-inbox button');await wait('document.querySelectorAll("app-slack-inbox .entry").length===1');
 await openTitle('QA Slack invalid <img src=x onerror=alert(1)>');assert(!await evaluate('document.querySelectorAll("app-slack-inbox img,app-slack-inbox script").length'));assert(!await evaluate('[...document.querySelectorAll("app-slack-inbox button")].some(e=>e.innerText.includes("Onayla ve"))'));
 await clickButton('Reddet','app-slack-inbox button');await wait('document.querySelectorAll("app-slack-inbox .entry").length===0');
 await choose('select[aria-label="Slack kuyruk görünümü"]','APPROVED');await wait('document.querySelectorAll("app-slack-inbox .entry").length===2');
 const after=JSON.parse(await evaluate("fetch('/api/export').then(r=>r.json()).then(x=>JSON.stringify(x.tables))"));
 assert.equal(after.defect_detail.filter(d=>d.reporter_id==='UTEST123').length,2);assert(after.defect_detail.filter(d=>d.reporter_id==='UTEST123').every(d=>d.source_url.includes('TTEST123/CTEST123')));
 assert.equal(after.backlog_item.length,before.backlog_item.length+2);assert.equal(after.sprint_task.length,before.sprint_task.length+1);assert.deepEqual(after.assignment,before.assignment);assert.deepEqual(after.leave_record,before.leave_record);assert.deepEqual(after.overtime_entry,before.overtime_entry);
 assert.equal(events.length,0,events.join('\n'));console.log('Slack approval UI PASS: persistent encrypted settings, configurable parser, safe inbox, backlog/sprint approval, rejection, mobile/desktop; no real Slack requests.');
};
