const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async({evaluate,command,navigate,clickButton,setFieldValue,sleep,events})=>{
 async function api(path){return JSON.parse(await evaluate(`fetch('/api'+${JSON.stringify(path)}).then(r=>{if(!r.ok)throw Error(r.status);return r.json()}).then(JSON.stringify)`));}
 async function waitFor(e){for(let i=0;i<100;i++){if(await evaluate(e))return;await sleep(100);}throw Error('Timeout '+e);}
 const before=await api('/export');await navigate('reports','Raporlar');await clickButton('Kapasite trendi');await waitFor('document.querySelectorAll("app-capacity-trend .trend-row").length===6');
 const rows=await api('/reports'),members=await api('/reports/members');const names=[...rows].sort((a,b)=>a.number-b.number).slice(-6).map(r=>r.name);
 assert.deepEqual(JSON.parse(await evaluate('JSON.stringify([...document.querySelectorAll("app-capacity-trend .row-head strong")].map(e=>e.textContent))')),names);
 const bars=JSON.parse(await evaluate('JSON.stringify([...document.querySelectorAll("app-capacity-trend .trend-row")].map(e=>[...e.querySelectorAll(".bar-row>strong")].map(n=>n.textContent.trim())))'));
 assert(await evaluate('[...document.querySelectorAll("app-capacity-trend .stacked")].every(e=>e.querySelector(".planned")&&e.querySelector(".support"))'));
 assert(await evaluate('[...document.querySelectorAll("app-capacity-trend .core-comparison")].every(e=>e.textContent.includes("Çekirdek plan / kapasite"))'));
 const segments=JSON.parse(await evaluate('JSON.stringify([...document.querySelectorAll("app-capacity-trend .trend-row")].map(e=>[...e.querySelectorAll(".plan-breakdown strong")].map(n=>n.textContent)))'));
 const fmt=n=>new Intl.NumberFormat('tr-TR',{maximumFractionDigits:2}).format(n)+' sa';
 [...rows].sort((a,b)=>a.number-b.number).slice(-6).forEach((s,i)=>{
  const all=members.filter(m=>m.sprintId===s.id),core=all.filter(m=>m.engagement!=='SUPPORT'&&m.teamRole!=='ARCHITECT'&&m.capacitySource!=='UNSPECIFIED_SUPPORT');
  const known=core.filter(m=>['FROZEN','RECALCULATED'].includes(m.capacitySource)&&Number.isFinite(m.availableHours));
  if(all.length){assert.deepEqual(segments[i],[fmt(core.reduce((n,m)=>n+m.effortHours,0)),fmt(all.filter(m=>!core.includes(m)).reduce((n,m)=>n+m.effortHours,0))]);assert.equal(bars[i][0],known.length||!core.length?fmt(known.reduce((n,m)=>n+m.availableHours,0)):'—');assert.equal(bars[i][1],fmt(all.reduce((n,m)=>n+m.effortHours,0)));}
 });
 assert((await evaluate('document.querySelector("app-capacity-trend").textContent')).includes('Çevrim süresi henüz ölçülmüyor'));
 await setFieldValue('[name=trendSource]','FROZEN');await waitFor('document.querySelector("app-capacity-trend .trend-row")?.textContent.includes("Karşılaştırılabilir kayıt yok")');
 assert(await evaluate('document.querySelectorAll("app-capacity-trend .bar-row").length===0'));
 await setFieldValue('[name=trendSource]','RECALCULATED');
 const person=members.find(r=>r.capacitySource==='RECALCULATED');await setFieldValue('[name=trendMember]',person.memberId);
 await waitFor(`document.querySelector(".trend-scope")?.textContent.includes(${JSON.stringify(person.memberName)})`);
 await evaluate('(()=>{const s=document.querySelector("[name=trendLimit]");s.value=s.options[2].value;s.dispatchEvent(new Event("change",{bubbles:true}));})()');
 await waitFor('document.querySelectorAll("app-capacity-trend .trend-row").length===13');
 await evaluate('(()=>{const original=URL.createObjectURL;URL.createObjectURL=function(blob){blob.text().then(t=>window.__trendCsv=t);return original.call(this,blob)};HTMLAnchorElement.prototype.click=function(){window.__trendFilename=this.download;};})()');
 await clickButton('Kapasite trendi CSV indir');await waitFor('!!window.__trendCsv');
 const csv=await evaluate('window.__trendCsv');assert(csv.includes(person.memberName));assert(csv.includes('Toplam planlanan efor'));assert(csv.includes('Çekirdek plan / kapasite (%)'));assert(csv.includes('Gerçekleşen efor veya performans değildir'));assert.equal(await evaluate('window.__trendFilename'),'sprintboard-kapasite-trendi.csv');
 await setFieldValue('[name=trendMember]','');await setFieldValue('[name=trendSource]','');await evaluate('(()=>{const s=document.querySelector("[name=trendLimit]");s.value=s.options[0].value;s.dispatchEvent(new Event("change",{bubbles:true}));})()');
 fs.mkdirSync('tmp/capacity-trend-20261008',{recursive:true});
 for(const width of [1440,390]){await command('Emulation.setDeviceMetricsOverride',{width,height:950,deviceScaleFactor:1,mobile:false});await evaluate('document.querySelector("app-capacity-trend").scrollIntoView({block:"start"});window.scrollBy(0,-90)');await sleep(150);assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));const shot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync('tmp/capacity-trend-20261008/trend-'+width+'.png',Buffer.from(shot.data,'base64'));}
 await command('Emulation.setDeviceMetricsOverride',{width:1440,height:950,deviceScaleFactor:1,mobile:false});await command('Emulation.setEmulatedMedia',{media:'print'});
 assert(await evaluate('getComputedStyle(document.querySelector(".trend-filters")).display==="none"'));
 assert(await evaluate('getComputedStyle(document.querySelector(".trend-chart")).display!=="none"'));
 assert(await evaluate('getComputedStyle(document.querySelector(".cycle-readiness")).display!=="none"'));
 await command('Emulation.setEmulatedMedia',{media:''});
 await waitFor('[...document.querySelectorAll("button")].some(b=>b.textContent==="Tüm raporlar PDF"&&!b.disabled)');
 assert.deepEqual((await api('/export')).tables,before.tables);assert.equal(events.length,0,events.join('\n'));
 console.log('Capacity trend UI PASS: chronological six-sprint default, source/person/all-period filters, unknown empty state, scoped CSV, print CSS, 1440/390px and no data mutation.');
};
