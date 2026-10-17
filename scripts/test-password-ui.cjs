// Disposable accounts and database only; guarded by the smoke entry point.
const { join }=require('node:path');
const { writeFileSync }=require('node:fs');
module.exports=async function({evaluate,command,setFieldValue,sleep,events}){
  async function waitFor(expression,label){for(let i=0;i<60;i++){if(await evaluate(expression))return;await sleep(100);}throw Error(label);}
  async function click(selector){
    const p=JSON.parse(await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing control');const r=e.getBoundingClientRect();return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2});})()`));
    await command('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});
    await command('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});
  }
  async function fill(current,next,confirm=next){await setFieldValue('[name=currentPassword]',current);await setFieldValue('[name=newPassword]',next);await setFieldValue('[name=confirmPassword]',confirm);}
  async function login(name,password){
    await setFieldValue('app-auth [name=username]',name);await setFieldValue('app-auth [name=password]',password);await click('app-auth button[type=submit]');
    await waitFor('!!document.querySelector(".account-trigger")','Login failed');
  }
  const viewer='qa.password.'+Date.now(),initial='qa-initial-password-123',next='qa-next-password-456';
  if(!await evaluate(`(async()=>{const s=await(await fetch('/api/auth/session')).json();return(await fetch('/api/admin/users',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-TOKEN':s.csrfToken},body:JSON.stringify({username:${JSON.stringify(viewer)},password:${JSON.stringify(initial)}})})).ok})()`))throw Error('Fixture creation failed');
  // Admin can open and cancel; USER then exercises the complete same UI.
  await click('.account-trigger');await fill(initial,next);
  await click('.password-dialog button[type=button]');
  if(await evaluate('document.querySelector(".password-dialog").open||document.querySelector("[name=newPassword]").value!==""'))throw Error('Cancel leaked form state');
  await click('.topbar form[action="/logout"] button');await waitFor('!!document.querySelector("app-auth [name=username]")','Logout failed');
  await login(viewer,initial);
  await click('.account-trigger');await fill(initial,next,'mismatch-password');await click('.password-dialog button[type=submit]');
  await waitFor('document.querySelector(".password-dialog").innerText.includes("eşleşmiyor")','Confirmation was not checked');
  await fill('wrong-current-password',next);await click('.password-dialog button[type=submit]');
  await waitFor('document.querySelector(".password-dialog").innerText.includes("Mevcut şifre doğrulanamadı")','Current password check failed');
  if(await evaluate('document.querySelector("[name=currentPassword]").value!==""'))throw Error('Failure did not clear secrets');
  for(const [width,height] of [[1440,850],[390,650],[390,400]]){
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await sleep(100);
    if(await evaluate('(()=>{const r=document.querySelector(".password-dialog").getBoundingClientRect();return r.top<0||r.bottom>innerHeight+1||r.left<0||r.right>innerWidth+1})()'))throw Error('Dialog overflow '+width+'x'+height);
    if(process.env.SPRINTBOARD_PASSWORD_SCREENSHOT_DIR){const shot=await command('Page.captureScreenshot',{format:'png'});writeFileSync(join(process.env.SPRINTBOARD_PASSWORD_SCREENSHOT_DIR,`password-${width}-${height}.png`),Buffer.from(shot.data,'base64'));}
    if(!await evaluate('document.querySelector(".password-dialog").contains(document.activeElement)'))throw Error('Focus escaped dialog '+width+'x'+height+' '+await evaluate('JSON.stringify({active:document.activeElement.tagName,classes:document.activeElement.className,open:document.querySelector(".password-dialog").open,html:document.querySelector(".password-dialog").innerText})'));
  }
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await waitFor('!document.querySelector(".password-dialog").open','Escape failed');
  await command('Emulation.clearDeviceMetricsOverride',{});
  await click('.account-trigger');await fill(initial,next);await click('.password-dialog button[type=submit]');
  await waitFor('!!document.querySelector("app-auth")','Change did not log out');
  if(!await evaluate('document.querySelector("app-auth").innerText.includes("Şifreniz değiştirildi")'))throw Error('Success message missing');
  await login(viewer,next);
  if(!await evaluate('document.querySelector(".session-identity").innerText.includes("Salt okunur")'))throw Error('Role changed');
  // The deliberate wrong-current-password request is the only expected HTTP error.
  const unexpected=events.filter(e=>e!=='400 http://127.0.0.1:4183/api/auth/password'&&e!=='Failed to load resource: the server responded with a status of 400 ()');
  if(unexpected.length)throw Error('Browser errors: '+unexpected.join(' | '));
  console.log('Password UI: admin entry/cancel, USER validation/change/relogin, secret clearing, Escape/focus, 1440/390/short viewport OK');
};
