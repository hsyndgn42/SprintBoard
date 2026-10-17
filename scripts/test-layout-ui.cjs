const {mkdirSync,writeFileSync}=require('node:fs');
const {join}=require('node:path');
module.exports=async function({evaluate,command,navigate,clickButton,sleep,events}){
  const dir=process.env.SPRINTBOARD_LAYOUT_DIR||join('tmp','layout-audit');mkdirSync(dir,{recursive:true});
  const routes=[['overview','TOPLAM SPRİNT'],['roadmap','Roadmap'],['backlog','İş listesi'],['sprints','Sprint 14'],['sprints?status=completed','Sprint 13'],['sprints?status=planned','Bu bölümde sprint yok'],['team','Elçim'],['leaves','İzin geçmişi'],['overtime','Kişi mesaileri'],['reports','Sprint 13'],['settings','Çalışılmayan günler'],
    ...['summary','planning','capacity','effort','board','review','retro'].map(tab=>['sprints/legacy-sprint-14/'+tab,'Sprint 14'])];
  const results=[];
  async function key(key,code=key,shift=false){await command('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:key==='Escape'?27:9,modifiers:shift?8:0});await command('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:key==='Escape'?27:9});}
  async function waitFor(expression,label){for(let i=0;i<60;i++){if(await evaluate(expression))return;await sleep(100);}const shot=await command('Page.captureScreenshot',{format:'png'});writeFileSync(join(dir,'failure.png'),Buffer.from(shot.data,'base64'));throw Error(label+'; '+await evaluate('JSON.stringify({focus:document.activeElement?.outerHTML,modal:document.querySelector(".modal-layer")?.outerHTML.slice(0,700),hash:location.hash})'));}
  async function click(selector){const p=JSON.parse(await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2})})()`));await command('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await command('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});}
  for(const width of [1440,800,390]){
    await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
    for(const [route,title] of routes){
      await navigate(route,title);
      for(let i=0;i<60;i++){if(await evaluate('!document.querySelector("main .loading") && !document.querySelector("main")?.innerText.includes("yükleniyor…")'))break;await sleep(100);}
      await sleep(180);await evaluate('window.scrollTo(0,0)');
      const layout=JSON.parse(await evaluate(`JSON.stringify((()=>{
        const visible=e=>e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden';
        const rect=document.querySelector('main .page-head')?.getBoundingClientRect();
        const overflow=[...document.querySelectorAll('main *')].filter(e=>visible(e)&&e.getBoundingClientRect().right>innerWidth+1&&!e.closest('.table-wrap,.subtabs,.board,.report-chart-panel')).slice(0,12).map(e=>({tag:e.tagName,cls:e.className,right:Math.round(e.getBoundingClientRect().right)}));
        const unnamed=[...document.querySelectorAll('main input:not([type=hidden]),main select,main textarea')].filter(e=>visible(e)&&!e.labels?.length&&!e.getAttribute('aria-label')&&!e.getAttribute('aria-labelledby')).map(e=>({tag:e.tagName,name:e.name,cls:e.className}));
        return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,headerOverlap:!!rect&&rect.top<document.querySelector('.topbar').getBoundingClientRect().bottom-1,overflow,unnamed,h1:document.querySelector('main h1')?.textContent};
      })())`));
      results.push({route,...layout});
      const stem=route.replace(/[^a-z0-9-]/gi,'_')+'-'+width;
      const shot=await command('Page.captureScreenshot',{format:'png'});writeFileSync(join(dir,stem+'.png'),Buffer.from(shot.data,'base64'));
      if(width!==800&&['reports','settings','leaves','overtime','team'].includes(route)){
        await evaluate('window.scrollTo(0,document.documentElement.scrollHeight)');await sleep(80);
        const bottom=await command('Page.captureScreenshot',{format:'png'});writeFileSync(join(dir,stem+'-bottom.png'),Buffer.from(bottom.data,'base64'));
      }
      console.log(width,route,layout.scrollWidth>width+1?'OVERFLOW '+layout.scrollWidth:'OK',layout.unnamed.length?'UNNAMED '+layout.unnamed.length:'');
    }
  }
  writeFileSync(join(dir,'results.json'),JSON.stringify({results,events},null,2));
  const failures=results.filter(r=>r.scrollWidth>r.width+1||r.headerOverlap);
  if(failures.length||events.length)throw Error('Layout failures: '+failures.map(r=>r.route+'@'+r.width).join(', ')+'; browser errors: '+events.join(' | '));
  // Mobile navigation: hidden content must not participate in keyboard navigation.
  if(!await evaluate('document.querySelector(".sidebar").inert'))throw Error('Closed mobile navigation is focusable');
  await click('.mobile-menu');await waitFor('document.activeElement?.classList.contains("nav-close")','Menu focus was not transferred');
  if(!await evaluate('document.querySelector(".page-shell").inert'))throw Error('Menu background remains interactive');
  await key('Tab','Tab',true);if(!await evaluate('document.activeElement.matches(".sidebar .nav-link:last-child")'))throw Error('Menu backward focus wrap failed');
  await key('Tab');if(!await evaluate('document.activeElement.classList.contains("nav-close")'))throw Error('Menu forward focus wrap failed');
  await sleep(300);const menu=await command('Page.captureScreenshot',{format:'png'});writeFileSync(join(dir,'navigation-390.png'),Buffer.from(menu.data,'base64'));
  await key('Escape');await waitFor('document.activeElement?.classList.contains("mobile-menu") && document.querySelector(".sidebar").inert','Menu Escape/focus restore failed');
  await click('.mobile-menu');await sleep(300);await click('.sidebar a[href="#/team"]');await waitFor('document.activeElement?.id==="main-content" && !document.querySelector(".sidebar").classList.contains("open")','Mobile route focus failed');
  // Desktop sidebar must be restored when crossing the breakpoint.
  await click('.mobile-menu');await command('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});await sleep(100);
  if(await evaluate('document.querySelector(".sidebar").inert||document.querySelector(".page-shell").inert||document.body.style.overflow==="hidden"'))throw Error('Resize left background locked');
  const modals=[['roadmap','Roadmap','+ Hedef ekle'],['backlog','İş listesi','+ Yeni iş'],['backlog','İş listesi','Detay'],['sprints','Sprint 14','+ Yeni sprint'],['team','Elçim','Düzenle'],['leaves','İzin geçmişi','+ İzin ekle'],['overtime','Kişi mesaileri','+ Mesai kaydı'],['settings','Çalışılmayan günler','+ BAU işi ekle'],['sprints/legacy-sprint-14/planning','İşler ve atamalar','Atama düzenle'],['sprints/legacy-sprint-14/planning','İşler ve atamalar','Türü düzenle'],['sprints/legacy-sprint-14/capacity','KİŞİ KAPASİTESİ','Gün düzenle'],['sprints/legacy-sprint-14/summary','DÖNEM ÖZETİ','Backlog’dan iş ekle'],['sprints/legacy-sprint-14/summary','DÖNEM ÖZETİ','Sprinti tamamla']];
  for(const width of [1440,390]){
    await command('Emulation.setDeviceMetricsOverride',{width,height:width===390?550:900,deviceScaleFactor:1,mobile:false});
    for(const [route,title,button] of modals){
      await navigate(route,title);await sleep(160);
      const expectedButton=button==='Detay'?await evaluate('document.querySelector(".backlog-title-link").textContent.trim()'):button;
      await clickButton(expectedButton);
      await waitFor('!!document.querySelector(".modal-layer .modal[role=dialog]")','Missing dialog semantics: '+button);
      await sleep(100);
      if(!await evaluate('document.querySelector(".modal").contains(document.activeElement)'))throw Error('Modal initial focus: '+button);
      if(!await evaluate('document.querySelector(".modal").getAttribute("aria-labelledby") && document.querySelector(".topbar").closest("[inert]")'))throw Error('Missing name/background lock: '+button);
      if(await evaluate('(()=>{const r=document.querySelector(".modal").getBoundingClientRect();return r.top<0||r.bottom>innerHeight+1||r.right>innerWidth+1||r.left<0})()'))throw Error('Modal overflow: '+button+'@'+width);
      if(button==='Atama düzenle'&&await evaluate('[...document.querySelectorAll(".assignment-row")].some(row=>[...row.children].some(child=>child.getBoundingClientRect().bottom>row.getBoundingClientRect().bottom+1))'))throw Error('Assignment controls overlap adjacent rows: '+width);
      await evaluate('document.querySelector(".modal").focus()');await key('Tab');await key('Tab','Tab',true);
      await waitFor('document.querySelector(".modal").contains(document.activeElement)','Tab escaped: '+button+'@'+width);
      if(['Atama düzenle','Düzenle','+ Yeni iş'].includes(button)){const shot=await command('Page.captureScreenshot',{format:'png'});writeFileSync(join(dir,'dialog-'+button.replace(/[^a-z0-9]/gi,'_')+'-'+width+'.png'),Buffer.from(shot.data,'base64'));}
      await key('Escape');await waitFor('!document.querySelector(".modal-layer")','Escape failed: '+button);
      if(!await evaluate('document.activeElement?.textContent.trim()==='+JSON.stringify(expectedButton)))throw Error('Modal did not return focus: '+button);
      if(await evaluate('document.body.style.overflow==="hidden"||document.querySelector(".topbar").closest("[inert]")!==null'))throw Error('Modal background remained locked: '+button);
    }
  }
  if(events.length)throw Error(events.join(' | '));
  console.log('Layout sweep passed: '+results.length+' route/viewport combinations. Screenshots require visual review.');
  console.log('Mobile navigation + 26 dialog/viewport focus, Escape, background lock and sizing checks passed. No product writes performed.');
};
