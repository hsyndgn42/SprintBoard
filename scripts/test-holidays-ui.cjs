const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async({evaluate,command,navigate,clickButton,setFieldValue,sleep,events})=>{
  async function waitFor(e){for(let i=0;i<80;i++){if(await evaluate(e))return;await sleep(100);}throw Error('Timeout '+e);}
  await navigate('settings','Çalışılmayan günler');await clickButton('2027 tatillerini tamamla');
  await waitFor('document.querySelector("main").textContent.includes("2027: 16 gün eklendi")');
  await clickButton('2027 tatillerini tamamla');await waitFor('document.querySelector("main").textContent.includes("2027: 0 gün eklendi, 16 gün zaten kayıtlı")');
  await clickButton('2028 tatillerini tamamla');await waitFor('document.querySelector("main").textContent.includes("2028: 17 gün eklendi")');
  const days=JSON.parse(await evaluate('(async()=>JSON.stringify(await(await fetch("/api/calendar")).json()))()'));
  assert.equal(days.filter(d=>d.date.startsWith('2027')).length,16);assert.equal(days.filter(d=>d.date.startsWith('2028')).length,17);assert.equal(days.filter(d=>d.title.includes('ekip kararı: tam gün')).length,6);
  await setFieldValue('.calendar-controls select','2027');assert(await evaluate('document.querySelector(".calendar-controls").parentElement.textContent.includes("Kurban Bayramı 4. gün")'));
  fs.mkdirSync('tmp/holidays-20261008',{recursive:true});
  for(const width of [1440,390]){await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await evaluate('document.querySelector(".calendar-controls").parentElement.scrollIntoView({block:"start"});window.scrollBy(0,-85)');await sleep(200);assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));const shot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync('tmp/holidays-20261008/calendar-'+width+'.png',Buffer.from(shot.data,'base64'));}
  assert.equal(events.length,0,events.join('\n'));console.log('Holiday UI PASS: imports, repeated import, year filter, full-day labels, 1440/390px.');
};
