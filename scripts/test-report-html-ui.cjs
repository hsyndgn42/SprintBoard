const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async({evaluate,command,navigate,clickButton,setFieldValue,sleep,events})=>{
 async function waitFor(e){for(let i=0;i<100;i++){if(await evaluate(e))return;await sleep(100);}throw Error('Timeout '+e);}
 async function api(path){return JSON.parse(await evaluate(`fetch('/api'+${JSON.stringify(path)}).then(r=>r.json()).then(JSON.stringify)`));}
 const before=await api('/export');
 await navigate('reports','Raporlar');
 await waitFor('[...document.querySelectorAll("button")].some(b=>b.textContent==="Tüm raporlar PDF"&&!b.disabled)');
 assert(await evaluate('!document.querySelector(".report-export")'));
 await evaluate('window.__reportExports=[];window.__reportNames=[];const create=URL.createObjectURL;URL.createObjectURL=b=>{b.text().then(text=>window.__reportExports.push(text));return create(b)};HTMLAnchorElement.prototype.click=function(){window.__reportNames.push(this.download)}');
 fs.mkdirSync('tmp/report-html-ui',{recursive:true});
 const configs=[['delivery','Sprint teslimatı'],['members','Kişi dağılımı'],['context','Katılım bağlamı'],['types','İş tipleri'],['roadmap','Roadmap eforu'],['capacity','Kapasite trendi'],['defects','Defect']];
 const exports={};
 for(let i=0;i<configs.length;i++){
  const [kind,label]=configs[i];
  await clickButton(label);
  assert.equal(await evaluate('[...document.querySelectorAll("app-report-html-export button")].filter(e=>e.checkVisibility()).length'),1);
  if(kind==='members'){await setFieldValue('#report-panel-members select','legacy-sprint-13');await setFieldValue('#report-panel-members input','İsa');}
  if(kind==='types')await setFieldValue('#report-panel-types select','legacy-sprint-14');
  if(kind==='roadmap')await setFieldValue('#report-panel-roadmap input','BAU');
  if(kind==='capacity')await setFieldValue('[name=trendMember]','legacy-member-isa');
  if(kind==='defects')await setFieldValue('.defect-filters select','pool');
  await clickButton('HTML indir');
  await waitFor('window.__reportExports.length==='+JSON.stringify(i+1));
  const html=await evaluate('window.__reportExports.at(-1)');
  assert(html.includes('data-report="'+kind+'"'));assert(!/<script|<iframe|<form|<input|<button|<img/.test(html));assert(!html.includes('photo-qa-admin'));assert(html.includes('default-src'));
  if(kind==='members'||kind==='context'){assert(html.includes('İsa'));assert(html.includes('Sprint 13'));assert(!html.includes('Elçim'));assert(!html.includes('Görkem'));}
  if(kind==='types'){assert(html.includes('Sprint 14'));assert(!html.includes('Sprint 13'));}
  if(kind==='roadmap'){assert(html.includes('BAU'));assert(html.includes('Havuz'));}
  if(kind==='capacity'){assert(html.includes('İsa'));assert(html.includes('Son 6'));assert(!html.includes('Görkem'));}
  if(kind==='defects')assert(html.includes('Yalnız backlog havuzu'));
  exports[kind]=html;fs.writeFileSync('tmp/report-html-ui/'+kind+'.html',html);
 }
 assert.equal(new Set(JSON.parse(await evaluate('JSON.stringify(window.__reportNames)'))).size,7);
 // A zero-match filter must export the empty scope, not fall back to all data.
 await clickButton('Kişi dağılımı');await setFieldValue('#report-panel-members input','NO_MATCH_EXPORT');
 await clickButton('HTML indir');await waitFor('window.__reportExports.length===8');
 const empty=await evaluate('window.__reportExports.at(-1)');assert(empty.includes('NO_MATCH_EXPORT'));assert(empty.includes('Seçili kapsamda kayıt yok'));assert(!empty.includes('İsa'));
 // Scoped CSV is retained inside the tab.
 await setFieldValue('#report-panel-members input','İsa');await clickButton('CSV indir');await waitFor('window.__reportExports.length===9');assert((await evaluate('window.__reportExports.at(-1)')).includes('İsa'));
 for(const width of [1440,390]){
  await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});await clickButton('Roadmap eforu');await evaluate('window.scrollTo(0,0)');await sleep(100);
  assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
  for(const label of ['Roadmap eforu','Kapasite trendi','Defect','Katılım bağlamı']){
   await clickButton(label);
   assert(await evaluate(`[...document.querySelectorAll('.section-head')].filter(e=>e.checkVisibility()&&e.querySelector('app-report-html-export')).every(e=>{const a=e.firstElementChild.getBoundingClientRect(),b=e.querySelector('app-report-html-export').getBoundingClientRect();return a.right<=b.left+1||a.bottom<=b.top+1||b.right<=a.left+1})`),'Header export overlap '+label+' '+width);
  }
  await clickButton('Roadmap eforu');
  fs.writeFileSync('tmp/report-html-ui/app-'+width+'.png',Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'));
 }
 assert.deepEqual((await api('/export')).tables,before.tables);
 assert.equal(events.length,0,events.join('\n'));
 await command('Page.enable',{});
 const tree=await command('Page.getFrameTree',{});
 for(const [kind,html] of Object.entries(exports)){
  await command('Page.setDocumentContent',{frameId:tree.frameTree.frame.id,html});
  for(const width of [1440,390]){
   await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});await evaluate('window.scrollTo(0,0)');await sleep(70);
   assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'HTML overflow '+kind+' '+width);
   fs.writeFileSync('tmp/report-html-ui/'+kind+'-'+width+'.png',Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'));
  }
  await command('Emulation.setDeviceMetricsOverride',{width:1100,height:900,deviceScaleFactor:1,mobile:false});await command('Emulation.setEmulatedMedia',{media:'print'});await sleep(50);
  assert(await evaluate('document.querySelector("main").getBoundingClientRect().width<=innerWidth+1'));
  fs.writeFileSync('tmp/report-html-ui/'+kind+'-print.png',Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'));await command('Emulation.setEmulatedMedia',{media:''});
 }
 console.log('Per-tab HTML UI PASS: 7 independent exports, selected filters, unique filenames, empty scope, scoped CSV, offline mobile/desktop/print layout and no data mutation.');
};
