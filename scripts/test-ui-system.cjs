// Runs inside the existing disposable-database browser regression, never on live data.
const assert = require('node:assert/strict');
module.exports = async ({evaluate,command,navigate,clickButton,setFieldValue,api,waitFor,sprint,shot,sleep}) => {
  assert.equal(new URL(process.env.SPRINTBOARD_BASE_URL).port, '4183', 'UX fixtures require the isolated QA service');
  for (const [name,title,role] of [['Deniz Yılmaz','Product Owner / Lead','DESIGNER'],['Ece Uzunsoy','Experience Designer','DESIGNER'],['Arda Yıldız','Senior Developer','DEVELOPER'],['Selin Aksoy','Test Engineer','TEST_ENGINEER'],['Uzun İsimli Takım Üyesi','Platform Architecture & Integration','ARCHITECT']]) {
    await api('/team',{name,title,role:'Member',teamRole:role,engagement:role==='ARCHITECT'?'SUPPORT':'CORE',joinedOn:'2026-01-01'});
  }
  for (const title of ['Müşteri deneyimi ve yeni nesil servisler','Entegrasyon platformu']) {
    await api('/roadmap',{title,description:'Ürün hedefleri, teslimatlar ve ekip çalışmalarının ortak görünümü.',kind:'PROJECT',referenceId:'TC-UX',priority:'HIGH',status:'active',targetDate:'2026-12-31'});
  }
  async function viewport(width) {
    await command('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:false});
    await sleep(100);
  }
  async function noOverflow(label) {
    const widths=JSON.parse(await evaluate('JSON.stringify({page:document.documentElement.scrollWidth,viewport:innerWidth})'));
    if(widths.page>widths.viewport+1){
      await shot('ux-overflow');
      console.log(label,await evaluate(`JSON.stringify([...document.querySelectorAll('main *')].filter(e=>e.checkVisibility() && e.getBoundingClientRect().right>innerWidth).slice(0,18).map(e=>({tag:e.tagName,cls:e.className,width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right,text:e.textContent.trim().slice(0,70)})))`));
    }
    assert(widths.page<=widths.viewport+1, `${label}: page width ${widths.page} exceeds viewport ${widths.viewport}`);
    const clipped=JSON.parse(await evaluate(`JSON.stringify([...document.querySelectorAll('main .btn')].filter(e=>e.checkVisibility() && e.getBoundingClientRect().width>0 && (e.scrollWidth>e.clientWidth+2||e.scrollHeight>e.clientHeight+2)).map(e=>e.textContent.trim()))`));
    assert.deepEqual(clipped,[],label+' clipped button labels');
  }
  const routes=[['overview','VIBE'],['roadmap','Roadmap'],['backlog','İş listesi'],['team','Takım ve roller'],['sprints','Sprintler'],['leaves','Kişi izinleri'],['overtime','Fazla mesai'],['reports','Raporlar'],['settings','Ayarlar'],...['planning','capacity','effort','board','review','journal','retro'].map(tab=>['sprints/'+sprint.id+'/'+tab,'Düzeltilmiş sprint'])];
  for(const width of [1440,1024,390]) {
    await viewport(width);
    for(const [route,heading] of routes) {
      await navigate(route,heading); await sleep(200);
      await noOverflow(width+' '+route);
      // Exercise expanded content as well as initially collapsed sections.
      await evaluate(`[...document.querySelectorAll('details[appFold],details.settings-section')].forEach(e=>e.open=true)`);
      await sleep(200);
      await noOverflow(width+' expanded '+route);
      const rails=JSON.parse(await evaluate(`JSON.stringify([...document.querySelectorAll('details.section-fold > summary > .effort-group-count, details.section-fold > summary > .planning-group-total, details.section-fold > summary > small, details.section-fold > summary > .muted, details.section-fold > summary > .btn.ui-refresh')].filter(e=>e.checkVisibility()).map(e=>({text:e.textContent.trim(),gap:e.parentElement.getBoundingClientRect().right-e.getBoundingClientRect().right-parseFloat(getComputedStyle(e.parentElement).paddingRight)})))`));
      for(const rail of rails)assert(Math.abs(rail.gap-24)<3,width+' '+route+' header right rail: '+JSON.stringify(rail));
      if(route.endsWith('/effort')) {
        assert(await evaluate(`[...document.querySelectorAll('.effort-total')].every(e=>getComputedStyle(e).textAlign==='right'&&getComputedStyle(e).justifyItems==='end')`),'Effort totals stay right-aligned');
      }
      if(route.endsWith('/review')) {
        await evaluate(`[...document.querySelectorAll('details[appFold]')].forEach(e=>e.open=false)`);
        await sleep(100);
        await noOverflow(width+' collapsed review');
        const gridRows=JSON.parse(await evaluate(`JSON.stringify([...document.querySelectorAll('.review-grid,.breakdown-grid')].map(g=>({columns:getComputedStyle(g).gridTemplateColumns.split(' ').length,cards:[...g.children].filter(e=>e.matches('details.section-fold')).map(e=>({title:e.textContent.trim().slice(0,50),top:e.getBoundingClientRect().top,margin:getComputedStyle(e).marginTop}))})))`));
        for(const grid of gridRows){
          for(let i=0;i<grid.cards.length;i++){
            assert.equal(grid.cards[i].margin,'0px','Review grid spacing belongs to gap, not sibling margins');
            if(i%grid.columns)assert(Math.abs(grid.cards[i].top-grid.cards[i-i%grid.columns].top)<1,'Same-row Review cards share the top edge: '+JSON.stringify(grid));
          }
        }
        if(width===1440){
          const headers=JSON.parse(await evaluate(`JSON.stringify([...document.querySelectorAll('.review details.section-fold > summary')].map(e=>({title:e.textContent.trim().slice(0,70),height:e.getBoundingClientRect().height})))`));
          assert(headers.length>8,'Review fold fixtures present');
          for(const h of headers)assert.equal(h.height,52,'Consistent closed Review header: '+h.title);
          const centers=JSON.parse(await evaluate(`JSON.stringify([...document.querySelectorAll('.review details.section-fold > summary > .btn')].filter(e=>e.checkVisibility()).map(e=>({text:e.textContent.trim(),offset:(e.getBoundingClientRect().top+e.getBoundingClientRect().bottom-e.parentElement.getBoundingClientRect().top-e.parentElement.getBoundingClientRect().bottom)/2})))`));
          for(const c of centers)assert(Math.abs(c.offset)<1,'Review action vertically centered: '+JSON.stringify(c));
          assert(await evaluate(`[...document.querySelectorAll('.review details.section-fold > summary')].every(e=>getComputedStyle(e,'::after').alignSelf==='center')`),'Disclosure arrows vertically centered');
        }
        if(width!==1024)await shot('ux-'+width+'-review-collapsed');
        if(width!==1024){
          await evaluate('document.querySelector(".breakdown-grid").previousElementSibling.scrollIntoView({block:"center"})');
          await shot('ux-'+width+'-review-grid-alignment');
          await evaluate('window.scrollTo(0,0)');
        }
        await evaluate(`[...document.querySelectorAll('details[appFold]')].forEach(e=>e.open=true)`);
      }
      // Capture the primary work area, not a long opened Slack inbox.
      if(route==='backlog')await evaluate(`[...document.querySelectorAll('details[appFold]')].forEach(e=>e.open=false)`);
      if(route==='settings')await evaluate(`[...document.querySelectorAll('details.settings-section')].forEach(e=>e.open=false)`);
      await sleep(200);
      await evaluate('window.scrollTo(0,0); document.activeElement?.blur()');
      if(width!==1024)await shot('ux-'+width+'-'+route.split('/').at(-1));
    }
  }
  await viewport(1440);await navigate('backlog','İş listesi');
  await waitFor('!!document.querySelector("tr[data-backlog-id]")');
  await setFieldValue('.backlog-filters input[type=search]','No matching UX item');
  await waitFor('!document.querySelector("tr[data-backlog-id]")');
  await sleep(200); // Settle table-height/scroll changes before the coordinate-based click.
  await clickButton('Filtreleri temizle');
  try { await waitFor('!!document.querySelector("tr[data-backlog-id]")'); }
  catch(error){await shot('ux-reset-failure');console.log(await evaluate('document.querySelector("main").innerText.slice(-4000)'));throw error;}
  assert.equal(await evaluate('document.querySelector(".backlog-filters input").value'),'');
  const heights=JSON.parse(await evaluate(`JSON.stringify([...document.querySelectorAll('.backlog-filters input,.backlog-filters select')].map(e=>e.getBoundingClientRect().height))`));
  assert(heights.every(h=>h===44),'Filter control height contract: '+heights);
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".backlog-filters")).gridTemplateColumns.split(" ").length'),3,'Desktop filters use three balanced columns');
  await viewport(390);
  await evaluate('document.querySelector(".backlog-table").scrollIntoView({block:"start"})');
  await shot('ux-390-backlog-items');
  for(const width of [1440,390]) {
    await viewport(width);
    for(const [route,heading,button] of [['backlog','İş listesi','+ Yeni iş'],['roadmap','Roadmap','+ Hedef ekle'],['team','Takım ve roller','+ Üye ekle'],['leaves','Kişi izinleri','+ İzin ekle'],['overtime','Fazla mesai','+ Mesai kaydı'],['sprints','Sprintler','+ Yeni sprint']]) {
      await navigate(route,heading);await clickButton(button);await waitFor('!!document.querySelector(".modal")');
      await noOverflow(width+' dialog '+route);
      assert(await evaluate('document.querySelector(".modal footer").getBoundingClientRect().bottom<=innerHeight'),route+' footer visible');
      assert(await evaluate('document.querySelector(".modal").contains(document.activeElement)'),route+' focus in dialog');
      if(route==='backlog')await shot('ux-'+width+'-form');
      await clickButton('Vazgeç');await waitFor('!document.querySelector(".modal")');
    }
  }
  // Report keyboard navigation and all panels must keep their filters/exports usable.
  await viewport(1440);await navigate('reports','Raporlar');
  await evaluate('document.querySelector("#report-tab-delivery").focus()');
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
  await command('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
  assert(await evaluate('document.querySelector("#report-tab-members").getAttribute("aria-selected")==="true"'));
  const tabs=JSON.parse(await evaluate('JSON.stringify([...document.querySelectorAll(".report-tabs button")].map(b=>b.id))'));
  for(const id of tabs){await evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);await sleep(150);await noOverflow('report '+id);await viewport(390);await noOverflow('mobile report '+id);await viewport(1440);}
  await navigate('overview','VIBE');
  console.log('PASS UX: 16 routes at 1440/1024/390px, open/closed disclosures, right-aligned header rails and effort totals, equal closed Review heights and centered actions/arrows, six dialog types at two sizes, visible actions/focus, aligned 44px controls, filter reset and nine report tabs.');
};
