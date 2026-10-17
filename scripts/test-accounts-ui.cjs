// Called by smoke-ui.cjs only against a disposable test service, never the real DB.
const { join } = require('node:path');
const { writeFileSync } = require('node:fs');
module.exports = async function ({ evaluate, command, clickButton, setFieldValue, navigate, sleep, events }) {
  async function waitFor(expression, label) {
    for (let i=0;i<60;i++) { if(await evaluate(expression)) return; await sleep(100); }
    throw Error(label);
  }
  async function click(selector) {
    const point = JSON.parse(await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing control');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2});})()`));
    await command('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
    await command('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
  }
  const user = 'qa.account.'+Date.now();
  const row = '[data-account="'+user+'"]';
  const dialog = '.account-dialog';
  await navigate('settings','Giriş hesapları');
  await waitFor('!!document.querySelector(".account-row")','Accounts not loaded');
  await clickButton('+ Kullanıcı ekle');
  await setFieldValue('input[name=newUsername]',user);
  await setFieldValue('input[name=accountPassword]','qa-test-password-123');
  await setFieldValue('input[name=accountPasswordRepeat]','not-the-same-password');
  if(!await evaluate('document.querySelector(".account-dialog button[type=submit]").disabled')) throw Error('Mismatched passwords accepted');
  await clickButton('Vazgeç');
  if(await evaluate('document.querySelector(".account-dialog").open')) throw Error('Cancel did not close');
  if(await evaluate('document.querySelector("input[name=accountPassword]").value')!=='') throw Error('Password not cleared on cancel');
  await clickButton('+ Kullanıcı ekle');
  await setFieldValue('input[name=newUsername]',user);
  await setFieldValue('input[name=accountPassword]','qa-test-password-123');
  await setFieldValue('input[name=accountPasswordRepeat]','qa-test-password-123');
  await clickButton('Onayla ve kaydet');
  await waitFor(`!!document.querySelector(${JSON.stringify(row)})`,'Created account not refreshed');
  await setFieldValue('.account-filters input','absent-user');
  await waitFor('document.querySelector("app-accounts").innerText.includes("Filtreye uygun hesap yok")','Search filter failed');
  await setFieldValue('.account-filters input','');
  await click(row+' button:last-child');
  if(!await evaluate('document.querySelector(".account-dialog button[type=submit]").disabled')) throw Error('Disable allowed without confirmation');
  await click('input[name=accountConfirmed]');
  await clickButton('Onayla ve kaydet');
  await waitFor(`document.querySelector(${JSON.stringify(row+' .status')})?.textContent.trim()==='Pasif'`,'Disable status not refreshed');
  await setFieldValue('.account-filters input',user);
  await setFieldValue('.account-filters select','inactive');
  await waitFor('document.querySelectorAll(".account-row").length===1','Inactive filter failed');
  await click(row+' button:first-child');
  await setFieldValue('input[name=accountPassword]','qa-replacement-password-456');
  await setFieldValue('input[name=accountPasswordRepeat]','qa-replacement-password-456');
  await click('input[name=accountConfirmed]');
  for (const width of [1440,390]) {
    await command('Emulation.setDeviceMetricsOverride',{width,height:850,deviceScaleFactor:1,mobile:false});
    await sleep(100);
    if(await evaluate('(()=>{const r=document.querySelector(".account-dialog").getBoundingClientRect();return r.top<0||r.bottom>innerHeight+1||r.left<0||r.right>innerWidth+1})()')) throw Error('Account dialog overflow at '+width);
    if(!await evaluate('document.querySelector(".account-dialog").contains(document.activeElement)')) throw Error('Dialog focus escaped');
    if(process.env.SPRINTBOARD_ACCOUNT_SCREENSHOT_DIR){const shot=await command('Page.captureScreenshot',{format:'png'});writeFileSync(join(process.env.SPRINTBOARD_ACCOUNT_SCREENSHOT_DIR,'account-dialog-'+width+'.png'),Buffer.from(shot.data,'base64'));}
  }
  await command('Emulation.clearDeviceMetricsOverride',{});
  await clickButton('Onayla ve kaydet');
  await waitFor('!document.querySelector(".account-dialog").open','Reset not completed');
  await waitFor(`!!document.querySelector(${JSON.stringify(row+' .status')})`,'Reset list refresh not completed');
  if(await evaluate(`document.querySelector(${JSON.stringify(row+' .status')}).textContent.trim()`)!=='Pasif') throw Error('Password reset enabled disabled account');
  await click(row+' button:last-child');await click('input[name=accountConfirmed]');await clickButton('Onayla ve kaydet');
  await waitFor('document.querySelector("app-accounts").innerText.includes("Filtreye uygun hesap yok")','Enabled account remained in inactive filter');
  await setFieldValue('.account-filters select','all');
  await click('.account-history summary');
  if(!await evaluate('document.querySelector(".account-history").innerText.includes("Şifre yenilendi")')) throw Error('Reset audit entry missing');
  const data=JSON.parse(await evaluate("fetch('/api/admin/account-events').then(r=>r.json()).then(JSON.stringify)"));
  if(data.filter(e=>e.username===user).length!==4)throw Error('Expected create/disable/reset/enable audit only');
  await click(row+' button:first-child');
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await waitFor('!document.querySelector(".account-dialog").open','Escape did not close');
  await navigate('reports','Sprint karşılaştırması');
  await navigate('settings','Giriş hesapları');
  await waitFor('!!document.querySelector(".account-row")','Accounts not loaded after navigation');
  if(await evaluate('document.querySelector(".account-dialog").open'))throw Error('Dialog leaked across pages');
  for(const width of [1440,390]) {
    await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
    await evaluate('document.querySelector("app-accounts").scrollIntoView({block:"start"});window.scrollBy(0,-85)');await sleep(100);
    if(await evaluate('document.documentElement.scrollWidth>innerWidth+1'))throw Error('Accounts page horizontal overflow');
    if(process.env.SPRINTBOARD_ACCOUNT_SCREENSHOT_DIR){const shot=await command('Page.captureScreenshot',{format:'png'});writeFileSync(join(process.env.SPRINTBOARD_ACCOUNT_SCREENSHOT_DIR,'accounts-'+width+'.png'),Buffer.from(shot.data,'base64'));}
  }
  await command('Emulation.clearDeviceMetricsOverride',{});
  if(events.length)throw Error('Account UI browser errors: '+events.join(' | '));
  console.log('Accounts UI: create/cancel/password confirmation, disable/enable/reset, filters, audit, Escape/focus, navigation, 1440/390 px: PASS');
};
