const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async({evaluate,command,navigate,clickButton,setFieldValue,sleep,events})=>{
 async function waitFor(e){for(let i=0;i<100;i++){if(await evaluate(e))return;await sleep(100);}throw Error('Timeout '+e);}
 await navigate('overtime','Kişi mesaileri');await waitFor('document.querySelectorAll(".overtime-person").length>0');
 assert(!(await evaluate('!!document.querySelector(".person-accordion")')));assert(!(await evaluate('!!document.querySelector(".mini-metrics")')));
 await setFieldValue('.overtime-search input','İsa');assert.equal(await evaluate('document.querySelectorAll(".overtime-person").length'),1);
 const button=await evaluate('document.querySelector(".overtime-person").innerText');
 fs.mkdirSync('tmp/overtime-summary-ui',{recursive:true});
 for(const width of [1440,390]){
  await command('Emulation.setDeviceMetricsOverride',{width,height:950,deviceScaleFactor:1,mobile:false});await sleep(400);await setFieldValue('.overtime-search input','');await evaluate('window.scrollTo(0,0)');
  assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));let shot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync('tmp/overtime-summary-ui/list-'+width+'.png',Buffer.from(shot.data,'base64'));
  await setFieldValue('.overtime-search input','İsa');await clickButton(await evaluate('document.querySelector(".overtime-person").textContent.trim()'));await waitFor('!!document.querySelector(".overtime-detail")');
  assert.equal(await evaluate('document.querySelector(".overtime-detail h2").textContent'),'İsa');assert(await evaluate('document.querySelectorAll(".overtime-detail tbody tr").length>0'));assert(await evaluate('document.querySelector(".modal header").getBoundingClientRect().top>=0'));assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
  shot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync('tmp/overtime-summary-ui/detail-'+width+'.png',Buffer.from(shot.data,'base64'));
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await waitFor('!document.querySelector(".modal")');assert(await evaluate('document.activeElement.matches(".overtime-person")'));
 }
 await clickButton('+ Mesai kaydı');assert(!(await evaluate('!!document.querySelector("[name=usedHours]")')));await clickButton('Vazgeç');await waitFor('!document.querySelector(".modal")');
 await setFieldValue('.overtime-search input','no-such-person');assert(await evaluate('document.querySelector("main").textContent.includes("Kişi bulunamadı")'));await setFieldValue('.overtime-search input','İsa');
 assert.equal(events.length,0,events.join('\n'));console.log('Overtime UI PASS: person totals, search, sprint-only modal, Escape/focus return, create/cancel, 1440/390 layouts, no browser errors.');
};
