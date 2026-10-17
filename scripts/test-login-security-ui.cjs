// Run only on disposable H2 with default limits. No real accounts are targeted.
const {join}=require('node:path');
const {writeFileSync}=require('node:fs');
module.exports=async function({evaluate,command,clickButton,setFieldValue,navigate,sleep,events}) {
  const missing='qa.missing.login.'+Date.now();
  async function waitFor(expression,label){for(let i=0;i<80;i++){if(await evaluate(expression))return;await sleep(100);}throw Error(label);}
  async function shots(prefix,scroll){for(const width of [1440,390]){
    await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
    if(scroll)await evaluate(scroll);await sleep(100);
    if(await evaluate('document.documentElement.scrollWidth>innerWidth+1'))throw Error('Horizontal overflow: '+prefix);
    if(process.env.SPRINTBOARD_LOGIN_SCREENSHOT_DIR){const shot=await command('Page.captureScreenshot',{format:'png'});writeFileSync(join(process.env.SPRINTBOARD_LOGIN_SCREENSHOT_DIR,prefix+'-'+width+'.png'),Buffer.from(shot.data,'base64'));}
  }await command('Emulation.clearDeviceMetricsOverride',{});}
  // Generate unknown-user failures, then use the actual native form for the blocked attempt.
  await evaluate(`(async()=>{let s=await fetch('/api/auth/session').then(r=>r.json());await fetch('/logout',{method:'POST',body:new URLSearchParams({_csrf:s.csrfToken})});for(let i=0;i<5;i++){s=await fetch('/api/auth/session').then(r=>r.json());const r=await fetch('/login',{method:'POST',body:new URLSearchParams({_csrf:s.csrfToken,username:${JSON.stringify(missing)},password:'qa-test-wrong-password'})});if(!r.ok||(await fetch('/api/auth/session').then(r=>r.json())).authenticated)throw Error('Expected anonymous failure response: '+r.status);}})()`);
  await command('Page.navigate',{url:'http://127.0.0.1:4183/#/login'});
  await command('Page.reload',{ignoreCache:true});
  await waitFor('!!document.querySelector("app-auth input[name=username]")','Login form did not render');
  await setFieldValue('app-auth input[name=username]',missing);
  await setFieldValue('app-auth input[name=password]','qa-test-wrong-password');
  await clickButton('Giriş yap');
  await waitFor('document.querySelector("h1")?.textContent.includes("Girişe kısa bir ara")','429 response screen missing');
  if(await evaluate('getComputedStyle(document.querySelector("main")).borderRadius')!=='16px')throw Error('Limiter response stylesheet did not load');
  await shots('login-limited');
  await evaluate('document.querySelector("a").click()');
  await waitFor('!!document.querySelector("app-auth input[name=username]")','Return to login failed');
  await setFieldValue('app-auth input[name=username]',process.env.SPRINTBOARD_USERNAME);
  await setFieldValue('app-auth input[name=password]',process.env.SPRINTBOARD_PASSWORD);
  await clickButton('Giriş yap');
  await waitFor('!!document.querySelector(".nav-link")','Another account could not log in');
  await navigate('settings','Giriş işlem geçmişi');
  await evaluate('document.querySelector(".login-history").open=true');
  await waitFor('document.querySelectorAll(".login-event").length>=7','Login history incomplete');
  await setFieldValue('.history-filters input',missing);
  await setFieldValue('.history-filters select','LOGIN_BLOCKED');
  await waitFor('document.querySelectorAll(".login-event").length===1','Blocked result filter failed');
  await setFieldValue('.history-filters input','not-found');
  await waitFor('document.querySelector(".login-history").innerText.includes("Filtreye uygun giriş kaydı yok")','Login history empty filter missing');
  await setFieldValue('.history-filters input',missing);
  await clickButton('Yenile');
  await waitFor('document.querySelectorAll(".login-event").length===1','Refresh lost filters');
  await setFieldValue('.history-filters input','');await setFieldValue('.history-filters select','');
  await shots('login-history','document.querySelector(".login-history").scrollIntoView({block:"start"});window.scrollBy(0,-85)');
  const unexpected=events.filter(e=>!e.includes('429 http://127.0.0.1:4183/login')&&!e.includes('status of 429'));
  if(unexpected.length)throw Error('Browser errors: '+unexpected.join(' | '));
  console.log('Login security UI: native POST 429, styled mobile/desktop response, return to login, separate account access, audit filters/empty/refresh: PASS');
};
