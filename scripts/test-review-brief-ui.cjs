const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async({evaluate,command,navigate,clickButton,sleep,events})=>{
 async function waitFor(e){for(let i=0;i<100;i++){if(await evaluate(e))return;await sleep(100);}throw Error('Timeout '+e);}
 async function api(path){return JSON.parse(await evaluate(`fetch('/api'+${JSON.stringify(path)}).then(r=>r.json()).then(JSON.stringify)`));}
 const before=await api('/export');
 await navigate('sprints/legacy-sprint-13/review','Review');
 await waitFor('[...document.querySelectorAll("button")].some(b=>b.textContent==="Sprint özeti HTML indir"&&!b.disabled)');
 await evaluate('window.__brief=[];const create=URL.createObjectURL;URL.createObjectURL=b=>{b.text().then(t=>window.__brief.push(t));return create(b)};HTMLAnchorElement.prototype.click=function(){}');
 await clickButton('Sprint özeti HTML indir');await waitFor('window.__brief.length===1');
 const html=await evaluate('window.__brief[0]');
 assert(html.includes('Sonuç dağılımı'));assert(html.includes('Size dağılımı'));assert(html.includes('Sprint 14'));assert(html.includes('SONRAKİ SPRINT'));assert(!html.includes('Tüm sprint işleri'));assert(!html.includes('<details>'));
 assert.deepEqual((await api('/export')).tables,before.tables);
 assert.equal(events.length,0,events.join('\n'));
 fs.mkdirSync('tmp/review-brief-ui',{recursive:true});fs.writeFileSync('tmp/review-brief-ui/review.html',html);
 // Render the downloaded, script-free HTML in this disposable browser, not inside the app.
 await command('Page.enable',{});
 const tree=await command('Page.getFrameTree',{});
 await command('Page.setDocumentContent',{frameId:tree.frameTree.frame.id,html});
 for(const width of [1440,800,390]){
  await command('Emulation.setDeviceMetricsOverride',{width,height:1050,deviceScaleFactor:1,mobile:false});await sleep(150);
  assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'overflow '+width);
  for(const [name,selector] of [['results','.visual-grid'],['next','.next-plan']]){
   await evaluate(`document.querySelector('${selector}').scrollIntoView({block:'start'})`);await sleep(100);
   const shot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync('tmp/review-brief-ui/'+name+'-'+width+'.png',Buffer.from(shot.data,'base64'));
  }
 }
 await command('Emulation.setDeviceMetricsOverride',{width:1000,height:1100,deviceScaleFactor:1,mobile:false});
 await command('Emulation.setEmulatedMedia',{media:'print'});await evaluate('document.querySelector(".visual-grid").scrollIntoView({block:"start"})');
 fs.writeFileSync('tmp/review-brief-ui/print.png',Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'));
 assert(await evaluate('!!document.querySelector(".outcome-ring")&&!document.querySelector("details,script,iframe")'));
 console.log('Review brief UI PASS: actual download, actual next sprint, readonly data, no details table, offline render at 1440/800/390px and print CSS.');
};
