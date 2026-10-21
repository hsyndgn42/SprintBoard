// Real-browser smoke check for the JAR-served Angular application.
const { spawn } = require('node:child_process');
const { mkdtempSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const chrome = process.env.SPRINTBOARD_CHROME || (process.platform === 'win32'
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : 'chromium');
const profile = mkdtempSync(join(tmpdir(), 'sprintboard-smoke-'));
const base = process.env.SPRINTBOARD_BASE_URL || 'http://127.0.0.1:4181';
const browser = spawn(chrome, [
  '--headless', '--no-sandbox', '--disable-gpu', '--disable-software-rasterizer',
  '--disable-extensions', '--no-first-run', '--window-size=1440,900', `--user-data-dir=${profile}`,
  '--remote-debugging-port=0', `${base}/#/overview`,
], { stdio: 'ignore' });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  let port;
  for (let i = 0; i < 100; i++) {
    if (browser.exitCode !== null) throw new Error(`Chrome exited: ${browser.exitCode}`);
    try { port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; break; }
    catch { await sleep(100); }
  }
  if (!port) throw new Error('Chrome DevTools did not start');
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = tabs.find(tab => tab.type === 'page');
  if (!page) throw new Error('No browser page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const events = [];
  const apiResponses = [];
  const requestUrls = new Map();
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') events.push(message.params.exceptionDetails.text);
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') events.push(message.params.entry.text);
    if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) events.push(`${message.params.response.status} ${message.params.response.url}`);
    if (message.method === 'Network.responseReceived' && message.params.response.url.includes('/api/')) apiResponses.push(`${message.params.response.status} ${message.params.response.url}`);
    if (message.method === 'Network.requestWillBeSent') requestUrls.set(message.params.requestId, message.params.request.url);
    if (message.method === 'Network.loadingFinished' && requestUrls.get(message.params.requestId)?.includes('/api/')) apiResponses.push('finished ' + requestUrls.get(message.params.requestId));
  });
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
  ws.send(JSON.stringify({ id: 2, method: 'Log.enable' }));
  ws.send(JSON.stringify({ id: 3, method: 'Network.enable' }));
  let commandId = 10;
  async function evaluate(expression) {
    const id = commandId++;
    const result = new Promise((resolve, reject) => {
      const handler = event => { const message = JSON.parse(event.data); if (message.id === id) {
        ws.removeEventListener('message', handler);
        if (message.result?.exceptionDetails) reject(new Error(message.result.exceptionDetails.exception?.description || message.result.exceptionDetails.text));
        else resolve(message.result?.result?.value || '');
      } };
      ws.addEventListener('message', handler);
    });
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }));
    return result;
  }
  async function command(method, params) {
    const id = commandId++;
    const result = new Promise((resolve, reject) => {
      const handler = event => { const message = JSON.parse(event.data); if (message.id === id) {
        ws.removeEventListener('message', handler);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result || {});
      } };
      ws.addEventListener('message', handler);
    });
    ws.send(JSON.stringify({ id, method, params }));
    return result;
  }
  async function clickButton(label, selector = 'main button') {
    let position = '';
    for (let i = 0; i < 30; i++) {
      position = await evaluate(`(() => { const dialog = document.querySelector('dialog:modal'); const button = [...document.querySelectorAll(${JSON.stringify(selector)})].find(node => (!dialog || dialog.contains(node)) && !node.closest('[inert]') && node.textContent.trim() === ${JSON.stringify(label)} && !node.disabled && !node.closest('details:not([open])') && node.checkVisibility()); if (!button) return ''; button.scrollIntoView({block:'center'}); const rect = button.getBoundingClientRect(); return JSON.stringify({x:rect.left+rect.width/2,y:rect.top+rect.height/2}); })()`);
      if (position) break;
      await sleep(100);
    }
    if (!position) throw new Error(`Button not found: ${label}`);
    const { x, y } = JSON.parse(position);
    await command('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }
  async function clickNav(label) {
    const position = await evaluate(`(() => { const link = [...document.querySelectorAll('aside .nav-link')].find(node => node.querySelector('span:last-child')?.textContent.trim() === ${JSON.stringify(label)}); if (!link) return ''; link.scrollIntoView({block:'center'}); const rect = link.getBoundingClientRect(); return JSON.stringify({x:rect.left+rect.width/2,y:rect.top+rect.height/2}); })()`);
    if (!position) throw new Error(`Navigation link not found: ${label}`);
    const { x, y } = JSON.parse(position);
    await command('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }
  async function clickSubtab(label) {
    const position = await evaluate(`(() => { const link = [...document.querySelectorAll('.subtabs a')].find(node => node.textContent.trim().startsWith(${JSON.stringify(label)})); if (!link) return ''; link.scrollIntoView({block:'center'}); const rect = link.getBoundingClientRect(); return JSON.stringify({x:rect.left+rect.width/2,y:rect.top+rect.height/2}); })()`);
    if (!position) throw new Error(`Subtab not found: ${label}`);
    const { x, y } = JSON.parse(position);
    await command('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }
  async function setFieldValue(selector, value) {
    const changed = await evaluate(`(() => { const field = document.querySelector(${JSON.stringify(selector)}); if (!field) return false; field.value = ${JSON.stringify(value)}; field.dispatchEvent(new Event('input', {bubbles:true})); field.dispatchEvent(new Event('change', {bubbles:true})); return true; })()`);
    if (!changed) throw new Error(`Field not found: ${selector}`);
  }
  async function navigate(route, expected) {
    await evaluate(`location.hash = ${JSON.stringify('#/' + route)}`);
    for (let i = 0; i < 40; i++) {
      const rendered = await evaluate('document.querySelector("main")?.innerText || ""');
      if (rendered.includes(expected)) return;
      await sleep(150);
    }
    throw new Error(`${route} did not render ${expected}`);
  }
  if (process.env.SPRINTBOARD_USERNAME && process.env.SPRINTBOARD_PASSWORD) {
    for (let i = 0; i < 40; i++) {
      if (await evaluate('location.origin') === new URL(base).origin) break;
      await sleep(100);
    }
    // Let Angular finish its initial session request before the test creates a second one.
    for(let i=0;i<60&&!await evaluate('!!document.querySelector("app-auth input[name=username]")');i++)await sleep(100);
    if (process.env.SPRINTBOARD_SETUP === '1') {
      const setup = `(async () => { const session = await (await fetch('/api/auth/session')).json(); if (!session.setupRequired) return true; const response = await fetch('/api/auth/setup',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-TOKEN':session.csrfToken},body:JSON.stringify({username:${JSON.stringify(process.env.SPRINTBOARD_USERNAME)},password:${JSON.stringify(process.env.SPRINTBOARD_PASSWORD)}}),credentials:'same-origin'}); return response.ok; })()`;
      if (!await evaluate(setup)) throw new Error('Isolated smoke admin setup failed');
    }
    const login = `(async () => { const session = await (await fetch('/api/auth/session')).json(); const body = new URLSearchParams({username:${JSON.stringify(process.env.SPRINTBOARD_USERNAME)},password:${JSON.stringify(process.env.SPRINTBOARD_PASSWORD)},_csrf:session.csrfToken}); await fetch('/login',{method:'POST',body,credentials:'same-origin'}); return (await (await fetch('/api/auth/session')).json()).authenticated; })()`;
    if (!await evaluate(login)) throw new Error('Browser login failed');
  }
  ws.send(JSON.stringify({ id: 4, method: 'Page.reload', params: { ignoreCache: true } }));
  let output = '';
  for (let i = 0; i < 40; i++) {
    output = await evaluate('document.body.innerText');
    if (output.includes('TOPLAM SPRİNT') || output.includes('Yönetici hesabını oluştur') || output.includes('Giriş yap')) break;
    await sleep(250);
  }
  if (!process.env.SPRINTBOARD_USERNAME) {
    if (!output.includes('Yönetici hesabını oluştur') && !output.includes('Giriş yap')) throw new Error('Authentication gate did not render');
    if (output.includes('TOPLAM SPRİNT')) throw new Error('Protected data visible before login');
    console.log('Authentication gate: OK');
  ws.close();
    return;
  }
  console.log('Overview:', output.match(/TOPLAM SPRİNT\s+(\d+)/)?.[1], 'sprints');
  if(process.env.SPRINTBOARD_SMOKE_SPRINT_EDIT==='1'){
    if(base!=='http://127.0.0.1:4183'||process.env.SPRINTBOARD_SETUP!=='1')throw Error('Sprint editing QA requires disposable 4183');
    await require('./test-sprint-edit-ui.cjs')({evaluate,command,navigate,clickButton,setFieldValue,sleep,events});ws.close();return;
  }
  if(process.env.SPRINTBOARD_SMOKE_PHOTO_SIZE==='1'){
    if(base!=='http://127.0.0.1:4183'||process.env.SPRINTBOARD_SETUP!=='1')throw Error('Photo size QA requires disposable 4183');
    await require('./test-photo-size-ui.cjs')({evaluate,command,navigate,clickButton,sleep});ws.close();return;
  }
  if(process.env.SPRINTBOARD_SMOKE_FULL_BACKUP==='1'){
    if(process.env.SPRINTBOARD_SETUP!=='1'||base!=='http://127.0.0.1:4183')throw Error('Backup QA requires disposable 4183');
    await navigate('settings','Yedekleme ve geri yükleme');
    await clickButton('Şimdi yedek al');
    let saved=false;for(let i=0;i<60;i++){if(await evaluate('document.querySelector("app-backup")?.innerText.includes("Tam yedek oluşturuldu: sprintboard-full-")')){saved=true;break;}await sleep(100);}
    if(!saved)throw Error('Manual backup success missing');
    if(await evaluate('document.querySelector("[data-testid=full-backup]").disabled'))throw Error('Backup button did not re-enable');
    await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    if(await evaluate('document.documentElement.scrollWidth>innerWidth+1'))throw Error('Mobile overflow');

    const state=await evaluate(`fetch('/api/admin/backups/status').then(r=>r.json())`);
    if(state.result!=='SUCCESS'||!state.lastSuccessAt||!state.nextScheduledAt)throw Error('Backup status missing');
    await command('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
    if(await evaluate('document.querySelectorAll(".settings-section").length')!==8)throw Error('Settings sections missing');
    if(await evaluate('document.querySelectorAll(".settings-section[open]").length')!==1)throw Error('Settings should initially open only backup');
    await evaluate(`(async()=>{const s=await fetch('/api/auth/session').then(r=>r.json());for(let i=1;i<=25;i++){const r=await fetch('/api/calendar',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-TOKEN':s.csrfToken},body:JSON.stringify({date:'2027-01-'+String(i).padStart(2,'0'),title:'Pagination QA '+i,memberId:''})});if(!r.ok)throw Error('Fixture failed');}})()`);
    await navigate('overview','Overview');await navigate('settings','Yedekleme ve geri yükleme');
    await evaluate(`[...document.querySelectorAll('.settings-section summary')].find(x=>x.textContent.startsWith('Çalışma takvimi')).click()`);
    await sleep(250);
    const first=await evaluate('document.querySelector(".calendar-form")?.nextElementSibling?.innerText || document.querySelector(\'[aria-label="Takvim sayfaları"]\')?.innerText');
    await clickButton('Sonraki →','nav[aria-label="Takvim sayfaları"] button');
    await sleep(200);
    if(!String(await evaluate('document.querySelector(\'[aria-label="Takvim sayfaları"]\').innerText')).includes('11–20'))throw Error('Calendar page did not advance: '+await evaluate('document.querySelector(\'[aria-label="Takvim sayfaları"]\').innerText'));
    await setFieldValue('.calendar-controls select','2028');await sleep(150);
    if(await evaluate('!!document.querySelector(\'[aria-label="Takvim sayfaları"]\')'))throw Error('Empty filter retains paging');
    await setFieldValue('.calendar-controls select','2027');await sleep(150);
    if(!String(await evaluate('document.querySelector(\'[aria-label="Takvim sayfaları"]\').innerText')).includes('1–10'))throw Error('Filter did not reset page');
    await navigate('reports','Raporlar');
    for(let i=0;i<100;i++){if(await evaluate('document.querySelectorAll(".sprint-report-table tbody tr").length'))break;await sleep(100);}
    const before=await evaluate('document.querySelectorAll(".sprint-report-table tbody tr").length');
    await evaluate('window.dispatchEvent(new Event("beforeprint"))');
    const printed=await evaluate('document.querySelectorAll(".sprint-report-table tbody tr").length');
    await evaluate('window.dispatchEvent(new Event("afterprint"))');
    if(before!==10||printed<=before)throw Error('Report print must include all rows: '+before+'/'+printed);
    if(events.some(e=>!e.includes('favicon')))throw Error('Browser errors: '+events.join(' | '));
    console.log('Backup status, settings accordions, pagination advance/filter reset and all-row print PASS');ws.close();return;
  }
  if(process.env.SPRINTBOARD_SMOKE_SLACK_DIGEST==='1'){
    if(base!=='http://127.0.0.1:4183'||process.env.SPRINTBOARD_SETUP!=='1')throw Error('Digest QA requires disposable 4183');
    await require('./test-slack-digest-ui.cjs')({evaluate,command,navigate,clickButton,setFieldValue,sleep,events});ws.close();return;
  }
  if(process.env.SPRINTBOARD_SMOKE_OVERTIME_MATCHING==='1'){
    if(base!=='http://127.0.0.1:4183'||process.env.SPRINTBOARD_SETUP!=='1')throw Error('Matching QA requires disposable 4183');
    await require('./test-overtime-matching-ui.cjs')({evaluate,command,navigate,clickButton,setFieldValue,sleep,events});ws.close();return;
  }
  if(process.env.SPRINTBOARD_SMOKE_OPERATIONAL_TRENDS==='1'){
    if(base!=='http://127.0.0.1:4183'||process.env.SPRINTBOARD_SETUP!=='1')throw Error('Trends QA requires disposable 4183');
    await require('./test-operational-trends-ui.cjs')({evaluate,command,navigate,clickButton,setFieldValue,sleep,events});ws.close();return;
  }
  if(process.env.SPRINTBOARD_SMOKE_SLACK_LAYOUT==='1'){
    if(base!=='http://127.0.0.1:4183'||process.env.SPRINTBOARD_SETUP!=='1')throw Error('Layout QA requires disposable 4183');
    await require('./test-slack-settings-layout.cjs')({evaluate,command,navigate,clickButton,setFieldValue,sleep,events});ws.close();return;
  }
  console.log('API responses:', apiResponses.join(' | '));
  if (events.length) console.error('Browser errors:', events.join(' | '));
  if(process.env.SPRINTBOARD_SMOKE_SLACK_OVERTIME==='1'){
    if(process.env.SPRINTBOARD_SETUP!=='1'||base!=='http://127.0.0.1:4183')throw Error('Overtime QA requires disposable 4183');
    await require('./test-slack-overtime-ui.cjs')({evaluate,command,navigate,clickButton,setFieldValue,sleep,events});ws.close();return;
  }
  if(process.env.SPRINTBOARD_SMOKE_REPORTER_NAMES==='1'){
    if(process.env.SPRINTBOARD_SETUP!=='1'||base!=='http://127.0.0.1:4183')throw Error('Names QA requires disposable 4183');
    await require('./test-reporter-name-ui.cjs')({evaluate,command,navigate,clickButton,setFieldValue,sleep,events});ws.close();return;
  }
  if(process.env.SPRINTBOARD_SMOKE_WORK_ACTIONS==='1'){
    if(process.env.SPRINTBOARD_SETUP!=='1'||base!=='http://127.0.0.1:4183')throw Error('Work actions QA requires disposable 4183');
    await require('./test-work-actions-ui.cjs')({evaluate,command,navigate,clickButton,setFieldValue,sleep,events});ws.close();return;
  }
  if(process.env.SPRINTBOARD_SMOKE_DEFECT_RESERVE==='1'){
    if(process.env.SPRINTBOARD_SETUP!=='1'||base!=='http://127.0.0.1:4183')throw Error('Reserve QA requires disposable 4183');
    await require('./test-defect-reserve-ui.cjs')({evaluate,command,navigate,clickButton,setFieldValue,sleep,events});ws.close();return;
  }
  if(process.env.SPRINTBOARD_SMOKE_SLACK==='1'){
    if(process.env.SPRINTBOARD_SETUP!=='1'||base!=='http://127.0.0.1:4183')throw Error('Slack QA requires disposable 4183');
    await require('./test-slack-ui.cjs')({evaluate,command,navigate,clickButton,setFieldValue,sleep,events,ws});ws.close();return;
  }
  if(process.env.SPRINTBOARD_SMOKE_BACKLOG_HISTORY==='1'){
    if(process.env.SPRINTBOARD_SETUP!=='1'||base!=='http://127.0.0.1:4183')throw Error('History QA requires disposable 4183');
    await require('./test-backlog-history-ui.cjs')({evaluate,command,navigate,clickButton,setFieldValue,sleep,events});ws.close();return;
  }
  if(process.env.SPRINTBOARD_SMOKE_LEAVE_REQUEST==='1'){
    if(process.env.SPRINTBOARD_SETUP!=='1'||base!=='http://127.0.0.1:4183')throw Error('Leave QA requires disposable 4183');
    await require('./test-leave-requests-ui.cjs')({evaluate,command,navigate,clickButton,setFieldValue,sleep,events});ws.close();return;
  }
  if(process.env.SPRINTBOARD_SMOKE_BAU==='1'){
    if(process.env.SPRINTBOARD_SETUP!=='1'||base!=='http://127.0.0.1:4183')throw Error('BAU QA requires disposable 4183');
    await require('./test-bau-ui.cjs')({evaluate,command,navigate,clickButton,setFieldValue,sleep,events});ws.close();return;
  }
  if(process.env.SPRINTBOARD_SMOKE_EMERGENCY==='1'){
    if(process.env.SPRINTBOARD_SETUP!=='1'||base!=='http://127.0.0.1:4183')throw Error('Emergency QA requires disposable 4183');
    await require('./test-emergency-ui.cjs')({evaluate,command,navigate,clickButton,setFieldValue,sleep,events});ws.close();return;
  }
  if(process.env.SPRINTBOARD_SMOKE_COLLABORATION==='1'){
    if(process.env.SPRINTBOARD_SETUP!=='1'||base!=='http://127.0.0.1:4183')throw Error('Collaboration QA requires disposable 4183');
    await require('./test-collaboration-ui.cjs')({evaluate,command,navigate,clickButton,setFieldValue,sleep,events});ws.close();return;
  }
  if(process.env.SPRINTBOARD_SMOKE_REPORT_HTML==='1'){
    if(process.env.SPRINTBOARD_SETUP!=='1'||base!=='http://127.0.0.1:4183')throw Error('Report HTML QA requires disposable 4183');
    await require('./test-report-html-ui.cjs')({evaluate,command,navigate,clickButton,setFieldValue,sleep,events});ws.close();return;
  }
  if(process.env.SPRINTBOARD_SMOKE_BOARD_ACTIONS==='1'){
    if(process.env.SPRINTBOARD_SETUP!=='1'||base!=='http://127.0.0.1:4183')throw Error('Board action QA requires disposable 4183');
    await require('./test-board-actions-ui.cjs')({evaluate,command,navigate,clickButton,setFieldValue,sleep,events});ws.close();return;
  }
  if(process.env.SPRINTBOARD_SMOKE_REVIEW_BRIEF==='1'){
    if(process.env.SPRINTBOARD_SETUP!=='1'||base!=='http://127.0.0.1:4183')throw Error('Review brief QA requires disposable 4183');
    await require('./test-review-brief-ui.cjs')({evaluate,command,navigate,clickButton,setFieldValue,sleep,events});ws.close();return;
  }
  if(process.env.SPRINTBOARD_SMOKE_REPORT_TABS==='1'){
    if(process.env.SPRINTBOARD_SETUP!=='1'||base!=='http://127.0.0.1:4183')throw Error('Report tabs QA requires disposable 4183');
    await require('./test-report-tabs-ui.cjs')({evaluate,command,navigate,clickButton,setFieldValue,sleep,events});ws.close();return;
  }
  if(process.env.SPRINTBOARD_SMOKE_ACTIVE_MEMBERS==='1'){
    if(process.env.SPRINTBOARD_SETUP!=='1'||base!=='http://127.0.0.1:4183')throw Error('Active-member QA requires disposable 4183');
    await require('./test-active-members-ui.cjs')({evaluate,command,navigate,clickButton,setFieldValue,sleep,events});ws.close();return;
  }
  if(process.env.SPRINTBOARD_SMOKE_OVERTIME_SUMMARY==='1'){
    if(process.env.SPRINTBOARD_SETUP!=='1'||base!=='http://127.0.0.1:4183')throw Error('Overtime QA requires disposable 4183');
    await require('./test-overtime-summary-ui.cjs')({evaluate,command,navigate,clickButton,setFieldValue,sleep,events});ws.close();return;
  }
  if(process.env.SPRINTBOARD_SMOKE_OVERVIEW==='1'){
    if(process.env.SPRINTBOARD_SETUP!=='1'||base!=='http://127.0.0.1:4183')throw Error('Overview QA requires disposable 4183');
    await require('./test-overview-ui.cjs')({evaluate,command,navigate,clickButton,setFieldValue,sleep,events});ws.close();return;
  }
  if(process.env.SPRINTBOARD_SMOKE_PHOTO_REVIEW==='1'){
    if(process.env.SPRINTBOARD_SETUP!=='1'||base!=='http://127.0.0.1:4183')throw Error('Photo QA requires disposable 4183');
    await require('./test-photo-review-ui.cjs')({evaluate,command,navigate,clickButton,setFieldValue,sleep,events});ws.close();return;
  }
  if(process.env.SPRINTBOARD_SMOKE_LEAVE_LEDGER==='1'){
    if(process.env.SPRINTBOARD_SETUP!=='1'||base!=='http://127.0.0.1:4183')throw Error('Leave QA requires disposable 4183');
    await require('./test-leave-ledger-ui.cjs')({evaluate,command,navigate,clickButton,setFieldValue,sleep,events});ws.close();return;
  }
  if(process.env.SPRINTBOARD_SMOKE_CAPACITY_TREND==='1'){
    if(process.env.SPRINTBOARD_SETUP!=='1'||base!=='http://127.0.0.1:4183')throw Error('Capacity trend QA requires disposable 4183');
    await require('./test-capacity-trend-ui.cjs')({evaluate,command,navigate,clickButton,setFieldValue,sleep,events});ws.close();return;
  }
  if(process.env.SPRINTBOARD_SMOKE_PLANNING_INSIGHTS==='1'){
    if(process.env.SPRINTBOARD_SETUP!=='1'||base!=='http://127.0.0.1:4183')throw Error('Planning QA requires disposable 4183');
    await require('./test-planning-insights-ui.cjs')({evaluate,command,navigate,clickButton,setFieldValue,sleep,events});ws.close();return;
  }
  if(process.env.SPRINTBOARD_SMOKE_PARTICIPATION==='1'){
    if(process.env.SPRINTBOARD_SETUP!=='1'||base!=='http://127.0.0.1:4183')throw Error('Participation QA requires isolated setup on 4183');
    await require('./test-participation-ui.cjs')({evaluate,command,navigate,clickButton,setFieldValue,sleep,events});ws.close();return;
  }
  if(process.env.SPRINTBOARD_SMOKE_MEMBER_CAPACITY==='1'){
    if(process.env.SPRINTBOARD_SETUP!=='1'||base!=='http://127.0.0.1:4183')throw Error('Member capacity QA requires disposable 4183');
    await require('./test-member-capacity-ui.cjs')({evaluate,command,navigate,clickButton,setFieldValue,sleep,events});ws.close();return;
  }
  if(process.env.SPRINTBOARD_SMOKE_WORK_SETTINGS==='1'){
    if(process.env.SPRINTBOARD_SETUP!=='1'||base!=='http://127.0.0.1:4183')throw Error('Work settings QA requires disposable 4183');
    await require('./test-work-settings-ui.cjs')({evaluate,command,navigate,clickButton,setFieldValue,sleep,events});ws.close();return;
  }
  if(process.env.SPRINTBOARD_SMOKE_HOLIDAYS==='1'){
    if(process.env.SPRINTBOARD_SETUP!=='1'||base!=='http://127.0.0.1:4183')throw Error('Holiday QA requires disposable 4183');
    await require('./test-holidays-ui.cjs')({evaluate,command,navigate,clickButton,setFieldValue,sleep,events});ws.close();return;
  }
  if(process.env.SPRINTBOARD_SMOKE_ROADMAP_PLANNING==='1'){
    if(process.env.SPRINTBOARD_SETUP!=='1'||base!=='http://127.0.0.1:4183')throw Error('Roadmap planning QA requires disposable 4183');
    await require('./test-roadmap-planning-ui.cjs')({evaluate,command,navigate,clickButton,setFieldValue,sleep,events});ws.close();return;
  }
  if(process.env.SPRINTBOARD_SMOKE_BAU_AUTO==='1'){
    if(process.env.SPRINTBOARD_SETUP!=='1'||base!=='http://127.0.0.1:4183')throw Error('BAU auto QA requires disposable 4183');
    await require('./test-bau-auto-ui.cjs')({evaluate,command,navigate,clickButton,setFieldValue,sleep,events});ws.close();return;
  }
  if(process.env.SPRINTBOARD_SMOKE_BAU_ROADMAP==='1'){
    if(process.env.SPRINTBOARD_SETUP!=='1'||base!=='http://127.0.0.1:4183')throw Error('BAU Roadmap QA requires disposable 4183');
    await require('./test-bau-roadmap-ui.cjs')({evaluate,command,navigate,clickButton,setFieldValue,sleep,events});ws.close();return;
  }
  if(process.env.SPRINTBOARD_SMOKE_ROADMAP_MAPPING==='1'){
    if(process.env.SPRINTBOARD_SETUP!=='1'||base!=='http://127.0.0.1:4183')throw Error('Roadmap mapping QA requires disposable 4183');
    await require('./test-roadmap-mapping-ui.cjs')({evaluate,command,navigate,setFieldValue,sleep,events});ws.close();return;
  }
  if(process.env.SPRINTBOARD_SMOKE_ROADMAP_EFFORT==='1'){
    if(process.env.SPRINTBOARD_SETUP!=='1'||base!=='http://127.0.0.1:4183')throw Error('Roadmap effort QA requires disposable 4183');
    await require('./test-roadmap-effort-ui.cjs')({evaluate,command,navigate,clickButton,setFieldValue,sleep,events});ws.close();return;
  }
  if(process.env.SPRINTBOARD_SMOKE_BACKLOG_TARGET==='1'){
    if(process.env.SPRINTBOARD_SETUP!=='1'||base!=='http://127.0.0.1:4183')throw Error('Backlog target QA requires disposable 4183');
    await require('./test-backlog-target-ui.cjs')({evaluate,command,navigate,clickButton,setFieldValue,sleep,events});ws.close();return;
  }
  if(process.env.SPRINTBOARD_SMOKE_OCTOBER_IMPORT==='1'){
    if(process.env.SPRINTBOARD_SETUP!=='1'||base!=='http://127.0.0.1:4183')throw Error('October import QA requires disposable 4183');
    await require('./test-october-import-ui.cjs')({evaluate,command,navigate,setFieldValue,sleep,events});ws.close();return;
  }
  // Dataset-agnostic overview check. This used to assert the page text contained
  // "14", which only held for the original author's live database. The intent is
  // to prove the overview renders real sprint data once authenticated, so assert
  // that the total-sprint metric exists and shows a valid non-negative integer.
  let totalSprints = '';
  for (let i = 0; i < 40; i++) {
    totalSprints = await evaluate(`(() => {
      const card = [...document.querySelectorAll('.overview-metrics article.metric')]
        .find(node => (node.querySelector('small')?.textContent || '').trim().toLocaleLowerCase('tr') === 'toplam sprint');
      if (!card) return '';
      return (card.querySelector('strong')?.textContent || '').trim();
    })()`);
    if (totalSprints) break;
    await sleep(250);
  }
  if (!totalSprints) throw new Error('Overview did not render the "Toplam sprint" metric');
  if (!/^\d+$/.test(totalSprints)) throw new Error('Overview total sprint metric is not a non-negative integer: ' + JSON.stringify(totalSprints));
  console.log('Overview total sprint metric:', totalSprints);
    if(process.env.SPRINTBOARD_SETTINGS_SCREENSHOT){
    await navigate('settings','İş alt türleri');
    for(let i=0;i<40&&!await evaluate('document.querySelectorAll(".subtype-row-setting").length>0');i++)await sleep(100);
    await setFieldValue('app-subtype-settings select','TEST');
    await evaluate('document.querySelector("app-subtype-settings").scrollIntoView({block:"start"});window.scrollBy(0,-90)');
    await sleep(150);
    const shot=await command('Page.captureScreenshot',{format:'png'});require('node:fs').writeFileSync(process.env.SPRINTBOARD_SETTINGS_SCREENSHOT,Buffer.from(shot.data,'base64'));
    ws.close();return;
  }
  if (process.env.SPRINTBOARD_SMOKE_LOGIN_SECURITY === '1') {
    if (process.env.SPRINTBOARD_SETUP !== '1' || base !== 'http://127.0.0.1:4183') throw Error('Login security smoke requires isolated test service at 4183');
    await require('./test-login-security-ui.cjs')({ evaluate, command, clickButton, setFieldValue, navigate, sleep, events });
    ws.close(); return;
  }
  if (process.env.SPRINTBOARD_SMOKE_PASSWORD === '1') {
    if (process.env.SPRINTBOARD_SETUP !== '1' || base !== 'http://127.0.0.1:4183') throw Error('Password smoke requires isolated test service at 4183');
    await require('./test-password-ui.cjs')({ evaluate, command, setFieldValue, sleep, events });
    ws.close(); return;
  }
  if (process.env.SPRINTBOARD_SMOKE_ACCOUNTS === '1') {
    if (process.env.SPRINTBOARD_SETUP !== '1' || base !== 'http://127.0.0.1:4183') throw Error('Account smoke requires isolated test service at 4183');
    await require('./test-accounts-ui.cjs')({ evaluate, command, clickButton, setFieldValue, navigate, sleep, events });
    ws.close(); return;
  }
  if (process.env.SPRINTBOARD_SMOKE_LAYOUT === '1') {
    if (process.env.SPRINTBOARD_SETUP !== '1' || base !== 'http://127.0.0.1:4183') throw Error('Layout acceptance requires disposable H2 at 4183');
    await require('./test-layout-ui.cjs')({evaluate,command,navigate,clickButton,setFieldValue,sleep,events});
    ws.close(); return;
  }
  if(process.env.SPRINTBOARD_SMOKE_SHARE==='1'){
    if(process.env.SPRINTBOARD_SETUP!=='1'||base!=='http://127.0.0.1:4183')throw Error('Share smoke requires disposable H2 at 4183');
    await require('./test-share-ui.cjs')({evaluate,command,navigate,clickButton,setFieldValue,sleep,events});ws.close();return;
  }
  if(process.env.SPRINTBOARD_SMOKE_FLOW==='1'){
    if(process.env.SPRINTBOARD_SETUP!=='1'||base!=='http://127.0.0.1:4183')throw Error('Flow smoke requires disposable H2 at 4183');
    await require('./test-flow-ui.cjs')({evaluate,command,navigate,clickButton,setFieldValue,sleep,events});ws.close();return;
  }
  if (process.env.SPRINTBOARD_SMOKE_BOARD === '1') {
    if(process.env.SPRINTBOARD_SETUP!=='1'||base!=='http://127.0.0.1:4183')throw Error('Board smoke requires disposable H2 at 4183');
    await require('./test-board-ui.cjs')({evaluate,command,navigate,clickButton,setFieldValue,sleep,events});
    ws.close();return;
  }
  if(process.env.SPRINTBOARD_SMOKE_REVIEW_NOTES==='1'){
    if(process.env.SPRINTBOARD_SETUP!=='1'||base!=='http://127.0.0.1:4183')throw Error('Review notes smoke requires disposable H2 at 4183');
    await require('./test-review-notes-ui.cjs')({evaluate,command,navigate,clickButton,setFieldValue,sleep,events});ws.close();return;
  }
  // Dataset-agnostic route smoke. These expectations used to be live-dataset
  // values ("Sprint 14", "Sprint 13", the member name "Elçim" and the hard-coded
  // id legacy-sprint-14), so the run failed on any other database. The intended
  // assertion is that each route renders its page, so match on the static page
  // headings instead.
  const pages = [
    ['roadmap', 'Roadmap'], ['backlog', 'İş listesi'], ['sprints', 'Sprintler'],
    ['team', 'Takım ve roller'],
    ['leaves', 'İzin geçmişi'], ['overtime', 'Kişi mesaileri'],
    ['reports', 'Raporlar'],
  ];
  // The sprint detail route needs a real id; resolve one from the API rather than
  // hard-coding one. With an empty dataset there is nothing to open, so skip it.
  const smokeSprintId = await evaluate("fetch('/api/sprints').then(r=>r.json()).then(list=>list.length?((list.find(s=>s.status==='active')||list[0]).id||''):'')");
  if (smokeSprintId) pages.splice(3, 0, ['sprints/' + smokeSprintId + '/summary', 'DÖNEM ÖZETİ']);
  else console.log('sprints/<id>/summary: SKIPPED (dataset contains no sprints)');
  // "Çalışılmayan günler" sits inside a collapsed <details>, so it is absent from
  // innerText; match the visible accordion label instead.
  if (process.env.SPRINTBOARD_ROLE !== 'USER') pages.push(['settings', 'Çalışma takvimi']);
  for (const [route, expected] of pages) {
    await evaluate(`location.hash = ${JSON.stringify('#/' + route)}`);
    let rendered = '';
    for (let i = 0; i < 40; i++) {
      rendered = await evaluate('document.querySelector("main").innerText');
      if (rendered.includes(expected)) break;
      await sleep(150);
    }
    if (!rendered.includes(expected)) throw new Error(`${route} did not render ${JSON.stringify(expected)}: ${rendered.slice(0, 300)}`);
    if (process.env.SPRINTBOARD_ROLE === 'USER' && route === 'team' && rendered.includes('Üye ekle'))
      throw new Error('Read-only user sees a team edit action');
    console.log(`${route}: OK`);
  }
  if(process.env.SPRINTBOARD_SMOKE_COMPANY_LEAVE==='1'){
    const records=JSON.parse(await evaluate("fetch('/api/leaves').then(r=>r.json()).then(JSON.stringify)"));
    const company=records.filter(r=>r.sprintId==='legacy-sprint-13'&&r.leaveType==='COMPANY_GRANTED');
    if(company.length!==7||company.some(r=>r.days!==5||r.entitlementEffect!=='NONE'||r.start!==null||r.end!==null))throw Error('Company leave classification or quantity incorrect');
    await navigate('leaves','Kişi izinleri');
    await setFieldValue('.filter-toolbar select:nth-of-type(1)','all');
    await evaluate('(()=>{for(const d of document.querySelectorAll(".person-accordion"))d.open=true;})()');
    if(await evaluate('document.querySelectorAll(".company-leave-note").length')!==7)throw Error('Missing non-deductible company leave label');
    const capacity=JSON.parse(await evaluate("fetch('/api/sprints/legacy-sprint-13/capacity').then(r=>r.json()).then(JSON.stringify)"));
    for(const leave of company){const c=capacity.find(c=>c.memberId===leave.memberId);if(!c||c.leaveDays!==5||c.availableHours!==80||c.plannedHours!==80||c.remainingHours!==0)throw Error('Incorrect company leave capacity: '+leave.memberName);}
    await command('Emulation.setDeviceMetricsOverride',{width:390,height:1000,deviceScaleFactor:1,mobile:false});
    if(await evaluate('document.documentElement.scrollWidth>window.innerWidth+1'))throw Error('Company leave mobile overflow');
    await sleep(350);
    await evaluate('document.querySelector(".company-leave-note").scrollIntoView({block:"center"})');
    if(process.env.SPRINTBOARD_COMPANY_SCREENSHOT){const shot=await command('Page.captureScreenshot',{format:'png'});require('node:fs').writeFileSync(process.env.SPRINTBOARD_COMPANY_SCREENSHOT,Buffer.from(shot.data,'base64'));}
    await command('Emulation.clearDeviceMetricsOverride',{});
    console.log('Company leave: seven undated five-day grants, no entitlement effect, capacity 80/80/0 and responsive label: OK');
  }
  if(process.env.SPRINTBOARD_SMOKE_TEAM_LAYOUT==='1'){
    await navigate('team','Takım');
    for(let i=0;i<40&&!await evaluate('document.querySelectorAll(".member-profile").length>=10');i++)await sleep(100);
    for(const width of [1920,1600,1440,390]){
      await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
      await sleep(100);
      const layout=JSON.parse(await evaluate('JSON.stringify([...document.querySelectorAll(".member-profile")].map(c=>({name:c.querySelector("strong").textContent,top:c.getBoundingClientRect().top,tagHeight:c.querySelector(".member-tags span").getBoundingClientRect().height,divider:c.querySelector(".member-profile-dates").getBoundingClientRect().top,footer:c.querySelector("footer")?.getBoundingClientRect().bottom})))'));
      const heights=layout.map(r=>r.tagHeight);
      if(Math.max(...heights)-Math.min(...heights)>1)throw Error('Team label heights differ at '+width+': '+JSON.stringify(layout));
      if(width>650)for(const a of layout)for(const b of layout)if(Math.abs(a.top-b.top)<1){
        if(Math.abs(a.divider-b.divider)>1)throw Error('Team divider drift at '+width+': '+a.name+'/'+b.name);
        if(Math.abs(a.footer-b.footer)>1)throw Error('Team footer drift at '+width+': '+a.name+'/'+b.name);
      }
      if(process.env.SPRINTBOARD_TEAM_SCREENSHOT_DIR&&width===1600){
        await evaluate('(()=>{const c=[...document.querySelectorAll(".member-profile")].find(c=>c.innerText.includes("Ümran"));c.scrollIntoView({block:"center"})})()');
        const shot=await command('Page.captureScreenshot',{format:'png'});require('node:fs').writeFileSync(join(process.env.SPRINTBOARD_TEAM_SCREENSHOT_DIR,'team-alignment.png'),Buffer.from(shot.data,'base64'));
      }
    }
    await command('Emulation.clearDeviceMetricsOverride',{});
    console.log('Team cards: consistent tag heights, per-row dividers and footers at 1920/1600/1440/390: OK');
  }
  if(process.env.SPRINTBOARD_SMOKE_MEMBER_CONTEXT==='1'){
    await navigate('reports','Raporlar');await clickButton('Katılım bağlamı');
    for(let i=0;i<60&&!await evaluate('document.querySelectorAll(".member-context").length>0');i++)await sleep(100);
    const rows=JSON.parse(await evaluate("fetch('/api/reports/members').then(r=>r.json()).then(JSON.stringify)"));
    if(!rows.length||!rows.some(r=>r.capacitySource==='RECALCULATED'))throw Error('Missing historical capacity provenance');
    if(rows.some(r=>r.supportTaskCount>r.taskCount||r.taskCount!==r.done+r.undone+r.other))throw Error('Incorrect member counts');
    await setFieldValue('#report-panel-context .report-filters select','legacy-sprint-13');
    await setFieldValue('#report-panel-context .report-filters input','Akın');
    for(let i=0;i<30&&await evaluate('document.querySelectorAll(".member-context").length')!==1;i++)await sleep(100);
    if(await evaluate('document.querySelectorAll(".member-context").length')!==1)throw Error('Context name filter failed');
    await evaluate('document.querySelector(".member-context summary").click()');
    const actual=JSON.parse(await evaluate('JSON.stringify({periods:document.querySelectorAll(".member-period").length,text:document.querySelector(".member-context").innerText})'));
    if(actual.periods!==1||!actual.text.includes('Sprint 13')||!actual.text.includes('Yeniden hesaplanan'))throw Error('Context period filter/source failed');
    for(const width of [1440,390]){
      await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
      await evaluate('document.querySelector("app-member-context").scrollIntoView({block:"start"});window.scrollBy(0,-90)');await sleep(150);
      if(await evaluate('document.querySelector("app-member-context").scrollWidth>document.querySelector("app-member-context").getBoundingClientRect().width+1'))throw Error('Member context overflows at '+width);
      if(process.env.SPRINTBOARD_MEMBER_SCREENSHOT_DIR){const shot=await command('Page.captureScreenshot',{format:'png'});require('node:fs').writeFileSync(join(process.env.SPRINTBOARD_MEMBER_SCREENSHOT_DIR,'member-context-'+width+'.png'),Buffer.from(shot.data,'base64'));}
    }
    await command('Emulation.clearDeviceMetricsOverride',{});
    await setFieldValue('#report-panel-context .report-filters input','no-match-member-qa');
    if(!await evaluate('document.querySelector("app-member-context").innerText.includes("katılım kaydı bulunamadı")'))throw Error('Context empty filter missing');
    await setFieldValue('#report-panel-context .report-filters input','');await setFieldValue('#report-panel-context .report-filters select','');
    if(events.length)throw Error('Member context browser errors: '+events.join(' | '));
    console.log('Member context: source provenance, period/person filters, X counts, empty state and responsive details: OK');
  }
  if (process.env.SPRINTBOARD_SMOKE_MODALS === '1') {
    await navigate('team', 'Takım üyeleri');
    await clickButton('Düzenle');
    await sleep(100);
    if (!await evaluate('!!document.querySelector(".modal-layer .modal h2") && document.querySelector(".modal-layer .modal h2").textContent.includes("Üyeyi düzenle")'))
      throw new Error('Team edit modal did not open immediately');
    if (process.env.SPRINTBOARD_SMOKE_SAVES === '1') {
      await setFieldValue('.modal-layer input[name="title"]', 'Support UI Test');
      await clickButton('Değişiklikleri kaydet');
      for (let i = 0; i < 30; i++) {
        if (await evaluate('document.querySelector("main")?.innerText.includes("Support UI Test") && !document.querySelector(".modal-layer")')) break;
        await sleep(100);
      }
      if (!await evaluate('document.querySelector("main")?.innerText.includes("Support UI Test") && !document.querySelector(".modal-layer")'))
        throw new Error('Saved member did not refresh in place');
    } else await clickButton('Vazgeç');
    await navigate('sprints/legacy-sprint-14/capacity', 'Planlanan yük / kullanılabilir saat');
    await clickButton('Gün düzenle');
    await sleep(100);
    if (!await evaluate('!!document.querySelector(".modal-layer .modal h2") && document.querySelector(".modal-layer .modal h2").textContent.includes("Sprint kapasitesi")'))
      throw new Error('Capacity modal did not open immediately');
    if (process.env.SPRINTBOARD_SMOKE_SAVES === '1') {
      await setFieldValue('.modal-layer input[type="number"]', '5');
      await clickButton('Kaydet');
      for (let i = 0; i < 30; i++) {
        if (await evaluate('document.querySelector("main")?.innerText.includes("ayrılan gün kaydedildi") && !document.querySelector(".modal-layer")')) break;
        await sleep(100);
      }
      if (!await evaluate('document.querySelector("main")?.innerText.includes("ayrılan gün kaydedildi") && !document.querySelector(".modal-layer")'))
        throw new Error('Saved capacity did not refresh in place');
      await clickButton('Gün düzenle');
    }
    await navigate('sprints/legacy-sprint-14/effort', 'Görev × kişi görünümü');
    if (await evaluate('!!document.querySelector(".modal-layer")')) throw new Error('Capacity modal leaked across tabs');
    await navigate('sprints/legacy-sprint-14/planning', 'İşler ve atamalar');
    if (!await evaluate('document.querySelector("main")?.innerText.includes("24 sa") && document.querySelector(".planning-group")?.getAttribute("aria-label") === "BAU işleri"'))
      throw new Error('Grouped planning or derived leave hours did not render');
    await clickButton('Atama düzenle');
    let assignmentsOpened = false;
    for (let i = 0; i < 20; i++) {
      assignmentsOpened = !!await evaluate('document.querySelector(".modal-layer .modal h2")?.textContent.includes("Atamaları düzenle")');
      if (assignmentsOpened) break;
      await sleep(100);
    }
    if (!assignmentsOpened) throw new Error('Assignment modal did not open on the planning tab');
    const unselected = await evaluate('(() => { const row = [...document.querySelectorAll(".assignment-row")].find(row => !row.querySelector("input[type=checkbox]").checked); return row ? row.querySelector("input[type=checkbox]").outerHTML : ""; })()');
    if (!unselected) throw new Error('No unselected member available for assignment test');
    await evaluate('(() => { const row = [...document.querySelectorAll(".assignment-row")].find(row => !row.querySelector("input[type=checkbox]").checked); row.querySelector("input[type=checkbox]").click(); return true; })()');
    if (!await evaluate('(() => { const row = [...document.querySelectorAll(".assignment-row")].find(row => row.querySelector("input[type=checkbox]").checked && row.querySelector("input[type=number]")?.value === "0"); return !!row; })()'))
      throw new Error('Selecting a new member did not reveal an editable effort field');
    const modalPosition = await evaluate('(() => { const modal = document.querySelector(".assignment-modal"); const header = modal?.querySelector("header")?.getBoundingClientRect(); const footer = modal?.querySelector("footer")?.getBoundingClientRect(); return JSON.stringify({headerTop:header?.top,footerBottom:footer?.bottom,viewport:innerHeight}); })()');
    const modalBounds = JSON.parse(modalPosition);
    if (modalBounds.headerTop < 0 || modalBounds.footerBottom > modalBounds.viewport)
      throw new Error('Assignment modal header or footer escaped viewport: ' + modalPosition);
    await clickButton('Vazgeç');
    if (await evaluate('!!document.querySelector(".assignment-modal")')) throw new Error('Assignment cancel did not close dialog');
    await clickButton('Atama düzenle');
    for (let i = 0; i < 20 && !await evaluate('!!document.querySelector(".assignment-modal .assignment-row")'); i++) await sleep(100);
    if (!await evaluate('!!document.querySelector(".assignment-modal .assignment-row")')) throw new Error('Assignment dialog did not reopen');
    if (process.env.SPRINTBOARD_SMOKE_SAVES === '1') {
      const addedMember = await evaluate('(() => { const row = [...document.querySelectorAll(".assignment-row")].find(row => !row.querySelector("input[type=checkbox]").checked); const name = row.querySelector(".assignment-person span").textContent.trim(); row.querySelector("input[type=checkbox]").click(); const field = row.querySelector("input[type=number]"); field.value = "1.5"; field.dispatchEvent(new Event("input",{bubbles:true})); return name; })()');
      await clickButton('Atamaları kaydet');
      for (let i = 0; i < 30; i++) {
        if (await evaluate('document.querySelector("main")?.innerText.includes("Atamalar kaydedildi") && !document.querySelector(".modal-layer")')) break;
        await sleep(100);
      }
      if (!await evaluate('document.querySelector("main")?.innerText.includes("Atamalar kaydedildi") && !document.querySelector(".modal-layer")'))
        throw new Error('Saved assignments did not refresh in place');
      if (!await evaluate(`document.querySelector(".planning-group")?.innerText.includes(${JSON.stringify(addedMember + ' (1.5 sa)')})`))
        throw new Error('New member effort did not appear after saving');
    }
    console.log('Immediate modals and tab cleanup: OK');
  }
  if (process.env.SPRINTBOARD_SMOKE_NAV === '1') {
    const beforeErrors = events.length;
    for (const label of ['Raporlar', 'Takım', 'Backlog', 'Genel bakış', 'Sprintler', 'İzinler', 'Fazla mesai', 'Takım']) {
      await clickNav(label);
      await sleep(100);
      if (label === 'Raporlar') {
        await sleep(200);
        await evaluate('(() => { window.scrollTo(0, 900); return window.scrollY; })()');
      }
      if (label === 'Takım' && await evaluate('window.scrollY') > 20)
        throw new Error('Page transition retained the previous page scroll position');
    }
    for (let i = 0; i < 30; i++) {
      if (await evaluate('document.querySelector("main h1")?.textContent.includes("Takım ve roller")')) break;
      await sleep(100);
    }
    if (!await evaluate('document.querySelector("main h1")?.textContent.includes("Takım ve roller")'))
      throw new Error('Rapid navigation ended on the wrong page: ' + await evaluate('JSON.stringify({hash:location.hash,heading:document.querySelector("main h1")?.textContent,body:document.querySelector("main")?.innerText.slice(0,160)})'));
    if (events.slice(beforeErrors).length) throw new Error('Rapid navigation browser errors: ' + events.slice(beforeErrors).join(' | '));
    await navigate('sprints', 'Sprintler');
    await clickSubtab('Geçmiş');
    for (let i = 0; i < 20 && !String(await evaluate('location.hash')).includes('status=completed'); i++) await sleep(100);
    if (!String(await evaluate('location.hash')).includes('status=completed')) throw new Error('Completed sprint tab did not change the route');
    for (let i = 0; i < 20 && await evaluate('document.querySelectorAll(".sprint-row").length') !== 13; i++) await sleep(100);
    if (await evaluate('document.querySelectorAll(".sprint-row").length') !== 13) throw new Error('Completed sprint tab left stale rows');
    await clickSubtab('Planlanan');
    for (let i = 0; i < 20 && !String(await evaluate('location.hash')).includes('status=planned'); i++) await sleep(100);
    if (!String(await evaluate('location.hash')).includes('status=planned')) throw new Error('Planned sprint tab did not change the route');
    for (let i = 0; i < 20 && !await evaluate('document.querySelector("main")?.innerText.includes("Bu bölümde sprint yok")'); i++) await sleep(100);
    if (!await evaluate('document.querySelector("main")?.innerText.includes("Bu bölümde sprint yok")')) throw new Error('Planned sprint tab left stale rows');
    await navigate('sprints/legacy-sprint-14/summary', 'DÖNEM ÖZETİ');
    await clickSubtab('Kapasite');
    for (let i = 0; i < 20 && !String(await evaluate('location.hash')).includes('/capacity'); i++) await sleep(100);
    if (!String(await evaluate('location.hash')).includes('/capacity')) throw new Error('Sprint capacity tab did not change the route');
    for (let i = 0; i < 20 && !await evaluate('document.querySelector("main")?.innerText.includes("Planlanan yük / kullanılabilir saat")'); i++) await sleep(100);
    if (!await evaluate('document.querySelector("main")?.innerText.includes("Planlanan yük / kullanılabilir saat")')) throw new Error('Sprint capacity tab left stale content');
    await clickSubtab('Efor matrisi');
    for (let i = 0; i < 20 && !String(await evaluate('location.hash')).includes('/effort'); i++) await sleep(100);
    if (!String(await evaluate('location.hash')).includes('/effort')) throw new Error('Sprint effort tab did not change the route');
    for (let i = 0; i < 20 && !await evaluate('document.querySelector("main")?.innerText.includes("Görev × kişi görünümü")'); i++) await sleep(100);
    if (!await evaluate('document.querySelector("main")?.innerText.includes("Görev × kişi görünümü")')) throw new Error('Sprint effort tab left stale content');
    console.log('Rapid navigation: OK');
  }
  if (process.env.SPRINTBOARD_SMOKE_EFFORT === '1') {
    await navigate('sprints/legacy-sprint-14/effort', 'Görev × kişi görünümü');
    const taskCheck = await evaluate('(async () => { const sprint = await (await fetch("/api/sprints/legacy-sprint-14")).json(); const names = [...document.querySelectorAll(".effort-task strong")].map(node => node.textContent.trim()); return JSON.stringify({expected:sprint.items.length,rendered:names.length,allFull:sprint.items.every(item => names.includes(item.name))}); })()');
    const taskResult = JSON.parse(taskCheck);
    if (!taskResult.allFull || taskResult.expected !== taskResult.rendered) throw new Error('Effort view truncated or omitted task names: ' + taskCheck);
    await setFieldValue('.effort-toolbar input[type="search"]', 'Team Support');
    if (await evaluate('document.querySelectorAll(".effort-row").length') !== 1) throw new Error('Effort task search did not narrow rows');
    await setFieldValue('.effort-toolbar input[type="search"]', '');
    const memberName = await evaluate('(() => { const field = document.querySelector(".effort-toolbar select"); field.value = field.options[1].value; field.dispatchEvent(new Event("change",{bubbles:true})); return field.options[1].textContent.trim(); })()');
    if (!await evaluate(`[...document.querySelectorAll(".effort-row")].every(row => row.innerText.includes(${JSON.stringify(memberName)}))`))
      throw new Error('Member filter kept tasks without the selected person');
    await setFieldValue('.effort-toolbar select', '');
    for (const width of [1440, 700, 400]) {
      await command('Emulation.setDeviceMetricsOverride', { width, height: 850, deviceScaleFactor: 1, mobile: false });
      const overflow = await evaluate('document.documentElement.scrollWidth - innerWidth');
      if (overflow > 1) throw new Error(`Effort view overflows horizontally at ${width}px by ${overflow}px`);
    }
    await command('Emulation.clearDeviceMetricsOverride', {});
    console.log('Full task names, effort filters and responsive layout: OK');
  }
  if (process.env.SPRINTBOARD_SMOKE_ESTIMATION === '1') {
    const sourceCoverage = JSON.parse(await evaluate('(async () => { const [settings,backlog,sprint] = await Promise.all([fetch("/api/settings").then(r=>r.json()),fetch("/api/backlog").then(r=>r.json()),fetch("/api/sprints/legacy-sprint-14").then(r=>r.json())]); return JSON.stringify({mode:settings.estimationMode,sizedBacklog:backlog.filter(item=>item.size).length,backlog:backlog.length,sizedSprint:sprint.items.filter(item=>item.size).length,tasks:sprint.items.length,points:backlog.filter(item=>item.storyPoints != null).length}); })()'));
    if (sourceCoverage.mode !== 'SIZE_AND_HOURS' || sourceCoverage.sizedBacklog !== sourceCoverage.backlog || sourceCoverage.sizedSprint !== sourceCoverage.tasks || sourceCoverage.points !== 0)
      throw new Error('Historical Size migration is incomplete: ' + JSON.stringify(sourceCoverage));
    await navigate('backlog', 'İş listesi');
    await clickButton('+ Yeni iş');
    if (!await evaluate('!!document.querySelector(".modal select[name=size]") && !document.querySelector(".modal input[name=storyPoints]")'))
      throw new Error('Size + effort backlog form is not configuration-driven');
    await setFieldValue('.modal input[name="title"]', 'Size smoke işi');
    await setFieldValue('.modal input[name="estimatedHours"]', '12');
    await setFieldValue('.modal select[name="size"]', 'MEDIUM');
    await clickButton('İşi ekle');
    for (let i = 0; i < 20 && !await evaluate('document.querySelector("main")?.innerText.includes("Size smoke işi")'); i++) await sleep(100);
    if (!await evaluate('document.querySelector("main")?.innerText.includes("Size smoke işi") && document.querySelector("main")?.innerText.includes("Size Medium")'))
      throw new Error('Size backlog item was not saved and rendered');
    await navigate('settings', 'Göreli tahmin + efor');
    await evaluate('document.querySelector("input[value=POINTS_AND_HOURS]").click()');
    await clickButton('Tahmin yöntemini kaydet');
    await navigate('backlog', 'İş listesi');
    await clickButton('+ Yeni iş');
    if (!await evaluate('!!document.querySelector(".modal input[name=storyPoints]") && !document.querySelector(".modal select[name=size]")'))
      throw new Error('Story Point + effort backlog form is not configuration-driven');
    await clickButton('Vazgeç');
    await navigate('settings', 'Göreli tahmin + efor');
    await evaluate('document.querySelector("input[value=SIZE_AND_HOURS]").click()');
    await clickButton('Tahmin yöntemini kaydet');
    console.log('Configurable estimation and historical Size coverage: OK');
  }
  if (process.env.SPRINTBOARD_SMOKE_REPORTS === '1') {
    await navigate('reports', 'Kişi bazlı iş yükü ve teslimat');
    for (let i = 0; i < 40 && await evaluate("document.querySelectorAll('.sprint-report-table tbody tr').length") !== 13; i++) await sleep(100);
    const reportState = JSON.parse(await evaluate(`(() => JSON.stringify({
      sprintRows:document.querySelectorAll('.sprint-report-table tbody tr').length,
      sizeChips:document.querySelectorAll('.sprint-report-table tbody tr:first-child .size-chip').length,
      memberRows:document.querySelectorAll('.member-report-table tbody tr').length,
      memberMetrics:document.querySelectorAll('.member-report-metrics > div').length,
      deliveryPoints:document.querySelector('.delivery-line')?.getAttribute('points')?.split(' ').length || 0,
      compositionRows:document.querySelectorAll('.composition-chart .composition-row').length,
      teamChartRows:document.querySelectorAll('.team-chart-row').length,
      taxonomyMetrics:document.querySelectorAll('.taxonomy-metrics > div').length,
      taxonomyDonut:!!document.querySelector('.taxonomy-donut'),
      taxonomyCategories:document.querySelectorAll('.taxonomy-category-bars article').length,
      taxonomyBreakdowns:document.querySelectorAll('.taxonomy-breakdown').length,
      hasGeneralTest:document.querySelector('.taxonomy-report-section')?.innerText.includes('Genel Test') || false,
      hasBauSupport:document.querySelector('.taxonomy-report-section')?.innerText.includes('Support') || false,
      brandIsHomeLink:document.querySelector('a.brand')?.getAttribute('href')?.includes('/overview') || false
    }))()`));
    if (reportState.sprintRows !== 13 || reportState.sizeChips !== 4 || reportState.memberRows < 1 || reportState.memberMetrics !== 4 || reportState.deliveryPoints !== 13 || reportState.compositionRows !== 8 || reportState.teamChartRows < 1 || reportState.taxonomyMetrics !== 4 || !reportState.taxonomyDonut || reportState.taxonomyCategories < 4 || reportState.taxonomyBreakdowns !== 3 || !reportState.hasGeneralTest || !reportState.hasBauSupport || !reportState.brandIsHomeLink)
      throw new Error('Report distributions did not render: ' + JSON.stringify(reportState));
    await setFieldValue('.report-filters select', 'legacy-sprint-13');
    if (!await evaluate('document.querySelector(".member-report-table tbody tr")?.innerText.includes("iş")'))
      throw new Error('Member report sprint filter did not keep report rows');
    await setFieldValue('.report-filters input', 'üyeye-ait-olmayan-arama');
    if (!await evaluate('document.querySelector("main")?.innerText.includes("Seçili filtrelerde atama kaydı bulunamadı")'))
      throw new Error('Member report search filter did not update empty state');
    await setFieldValue('.report-filters input', '');
    await evaluate('document.querySelector("a.brand").click()');
    for (let i = 0; i < 30 && !await evaluate('document.querySelector("main")?.innerText.includes("TOPLAM SPRİNT")'); i++) await sleep(100);
    if (!String(await evaluate('location.hash')).includes('/overview')) throw new Error('Product brand did not navigate home');
    console.log('Presentation charts, task taxonomy, member reports and home brand: OK');
  }
  if (process.env.SPRINTBOARD_SMOKE_TAXONOMY === '1') {
    await navigate('backlog', 'İş listesi');
    await clickButton('+ Yeni iş');
    if (!await evaluate('!!document.querySelector(".modal select[name=taskCategory]") && !document.querySelector(".modal select[name=taskSubtype]")'))
      throw new Error('Task category form did not start with top-level DEV');
    await setFieldValue('.modal select[name="taskCategory"]', 'TEST');
    for (let i = 0; i < 20 && !await evaluate('!!document.querySelector(".modal select[name=taskSubtype]")'); i++) await sleep(100);
    if (!await evaluate('[...document.querySelectorAll(".modal select[name=taskSubtype] option")].some(option => option.value === "E2E_TEST")'))
      throw new Error('TEST subtype options did not render');
    await setFieldValue('.modal select[name="taskSubtype"]', 'E2E_TEST');
    await setFieldValue('.modal input[name="title"]', 'Taksonomi smoke E2E testi');
    await setFieldValue('.modal input[name="estimatedHours"]', '8');
    await setFieldValue('.modal select[name="size"]', 'SMALL');
    await clickButton('İşi ekle');
    for (let i = 0; i < 30 && !await evaluate('document.querySelector("main")?.innerText.includes("Taksonomi smoke E2E testi")'); i++) await sleep(100);
    if (!await evaluate('document.querySelector("main")?.innerText.includes("TEST · E2E Test")'))
      throw new Error('Created task taxonomy did not render in backlog');
    if (!await evaluate('(() => { const row=[...document.querySelectorAll("tbody tr")].find(row=>row.innerText.includes("Taksonomi smoke E2E testi")); const button=[...(row?.querySelectorAll("button")||[])].find(button=>button.textContent.includes("Aktif sprinte al")); if(!button)return false; button.click(); return true; })()'))
      throw new Error('Created taxonomy task could not be added to active sprint');
    for(let i=0;i<40&&!await evaluate('!!document.querySelector(".acknowledge")');i++)await sleep(100);
    await evaluate('document.querySelector(".acknowledge input").click()');
    await setFieldValue('[name=scopeReason]','Smoke kapsam gerekçesi');await clickButton('Sprinte ekle');
    for (let i = 0; i < 40 && !await evaluate('(() => { const row=[...document.querySelectorAll("tbody tr")].find(row=>row.innerText.includes("Taksonomi smoke E2E testi")); return !!row && !row.innerText.includes("Aktif sprinte al"); })()'); i++) await sleep(100);
    await navigate('sprints/legacy-sprint-14/planning', 'İşler ve atamalar');
    if (!await evaluate('(() => { const row=[...document.querySelectorAll("tbody tr")].find(row=>row.innerText.includes("Taksonomi smoke E2E testi")); const button=[...(row?.querySelectorAll("button")||[])].find(button=>button.textContent.includes("Türü düzenle")); if(!button)return false; button.click(); return true; })()'))
      throw new Error('Task type edit action did not render in sprint planning');
    await setFieldValue('.taxonomy-modal .field:first-child select', 'DEFECT');
    for (let i = 0; i < 20 && !await evaluate('document.querySelectorAll(".taxonomy-modal select").length === 2'); i++) await sleep(100);
    await setFieldValue('.taxonomy-modal .field:nth-child(2) select', 'TEST_DEFECT');
    await clickButton('İş tipini kaydet');
    for (let i = 0; i < 30 && !await evaluate('document.querySelector("main")?.innerText.includes("DEFECT · Test Defect")'); i++) await sleep(100);
    if (!await evaluate('document.querySelector("main")?.innerText.includes("DEFECT · Test Defect")'))
      throw new Error('Sprint task taxonomy edit did not persist and render');
    await navigate('reports', 'İş tipi ve alt kırılım analizi');
    if (!await evaluate('document.querySelector(".taxonomy-report-section")?.innerText.includes("Test Defect")'))
      throw new Error('Edited defect subtype did not reach report graphics');
    console.log('Configurable task taxonomy creation, sprint edit and reporting: OK');
  }
  if (process.env.SPRINTBOARD_SMOKE_PAGER === '1') {
    await navigate('backlog', 'İş listesi');
    await setFieldValue('.card-pad .field select', 'all');
    for (let i = 0; i < 20 && !await evaluate('!!document.querySelector("nav.pager")'); i++) await sleep(100);
    if (!await evaluate('!!document.querySelector("nav.pager")')) throw new Error('Backlog pagination did not render');
    const firstItem = await evaluate('document.querySelector("tbody tr:first-child .backlog-title-link")?.textContent');
    if (!String(await evaluate('document.querySelector("nav.pager span")?.textContent')).includes('Sayfa 1 /'))
      throw new Error('Backlog did not start on page 1');
    await clickButton('Sonraki →');
    for (let i = 0; i < 20 && !String(await evaluate('document.querySelector("nav.pager span")?.textContent')).includes('Sayfa 2 /'); i++) await sleep(100);
    if (!String(await evaluate('document.querySelector("nav.pager span")?.textContent')).includes('Sayfa 2 /'))
      throw new Error('Next backlog page did not render immediately');
    const secondItem = await evaluate('document.querySelector("tbody tr:first-child .backlog-title-link")?.textContent');
    if (!secondItem || secondItem === firstItem) throw new Error('Backlog page changed but rows stayed stale');
    const listTop = Number(await evaluate('document.getElementById("backlog-results")?.getBoundingClientRect().top'));
    if (listTop < 65 || listTop > 200) throw new Error(`Pagination left results outside the viewport: ${listTop}`);
    await clickButton('← Önceki');
    if (!String(await evaluate('document.querySelector("nav.pager span")?.textContent')).includes('Sayfa 1 /'))
      throw new Error('Previous backlog page did not render immediately');
    if (await evaluate('document.querySelector("tbody tr:first-child .backlog-title-link")?.textContent') !== firstItem)
      throw new Error('Previous backlog page did not restore its rows');
    await clickButton('Sonraki →');
    await setFieldValue('.card-pad input[type="search"]', 'no-such-backlog-item-for-pagination-test');
    if (!await evaluate('document.querySelector("main")?.innerText.includes("Bu filtrede iş bulunamadı")'))
      throw new Error('Search filter did not update the backlog immediately');
    await setFieldValue('.card-pad input[type="search"]', '');
    if (!String(await evaluate('document.querySelector("nav.pager span")?.textContent')).includes('Sayfa 1 /'))
      throw new Error('Changing the backlog filter did not reset pagination');
    console.log('Backlog pagination and filters: OK');
  }
  if (process.env.SPRINTBOARD_SMOKE_BAU === '1') {
    await navigate('sprints/legacy-sprint-14/planning', 'Sprint 14 · On Leave');
    const historicalPlan = await evaluate('document.querySelector("main")?.innerText');
    for (const label of ['Sprint 14 · Team Meeting', 'Sprint 14 · Team Support', 'Sprint 14 · Training', 'Görkem (2 gün izin)', 'İsa (1 gün izin)', 'Yasin (X)'])
      if (!historicalPlan.includes(label)) throw new Error('Sprint 14 historical BAU detail missing: ' + label);
    await navigate('settings', 'BAU iş şablonları');
    for (let i = 0; i < 30 && await evaluate('document.querySelectorAll(".list-row").length') < 4; i++) await sleep(100);
    if (await evaluate('document.querySelectorAll(".list-row").length') < 4) throw new Error('Four BAU templates are missing');
    await clickButton('+ BAU işi ekle');
    await setFieldValue('.modal-layer input[name="bauTitle"]', 'Operasyon koordinasyonu');
    await setFieldValue('.modal-layer select[name="bauMode"]', 'CORE');
    await setFieldValue('.modal-layer input[name="bauDays"]', '1');
    await clickButton('Kaydet');
    for (let i = 0; i < 30 && !await evaluate('document.querySelector("main")?.innerText.includes("BAU şablonu kaydedildi")'); i++) await sleep(100);
    if (!await evaluate('document.querySelector("main")?.innerText.includes("BAU şablonu kaydedildi")'))
      throw new Error('New BAU template was not saved in Settings');
    await navigate('sprints', 'Sprintler');
    await clickButton('+ Yeni sprint');
    await setFieldValue('.modal-layer input[name="name"]', 'Sprint 15');
    await setFieldValue('.modal-layer input[name="start"]', '2026-09-15');
    await setFieldValue('.modal-layer input[name="end"]', '2026-09-29');
    await clickButton('Sprint oluştur');
    for (let i = 0; i < 30 && !await evaluate('document.querySelector(".sprint-row")?.textContent.includes("Sprint 15")'); i++) await sleep(100);
    if (!await evaluate('document.querySelector(".sprint-row")?.textContent.includes("Sprint 15")'))
      throw new Error('New sprint did not appear in the planned list');
    const detailHref = await evaluate('document.querySelector(".sprint-row")?.getAttribute("href")');
    await navigate(String(detailHref).replace(/^#\//, '').replace(/\/summary$/, '/planning'), 'Sprint 15 · Team Support');
    const detail = await evaluate('document.querySelector("main")?.innerText');
    if (!detail.includes('Sprint 15 · Team Meeting')) throw new Error('New sprint is missing Team Meeting');
    if (!detail.includes('Sprint 15 · On Leave') || !detail.includes('Sprint 15 · Training') || !detail.includes('Sprint 15 · Operasyon koordinasyonu'))
      throw new Error('New sprint is missing a default or configured BAU task');
    if (await evaluate('document.querySelector(".planning-group")?.getAttribute("aria-label") === "BAU işleri" && document.querySelectorAll(".planning-group:first-child tbody tr").length') !== 5)
      throw new Error('New sprint did not start with five configured BAU tasks');
    console.log('Configurable BAU templates and new sprint defaults: OK');
  }
  if (process.env.SPRINTBOARD_SMOKE_REVIEW === '1') {
    await navigate('sprints/legacy-sprint-14/review', 'Sprintin şu anki fotoğrafı');
    let reviewText = await evaluate('document.querySelector("app-sprint-review").innerText');
    for (const label of ['Sonuç dağılımı', 'Size dağılımı', 'Eforun sonuçlara dağılımı', 'Test kapsamı', 'Defect kapsamı', 'İzin kapasite etkisi', 'Canlı görünüm'])
      if (!reviewText.includes(label)) throw new Error('Review section missing: ' + label);
    const initialRows = await evaluate('document.querySelectorAll(".result-row:not(.filtered-out)").length');
    if (initialRows < 20) throw new Error('Review does not contain all historical tasks');
    await setFieldValue('[data-testid="review-search"]', 'no-match-review-928471');
    await sleep(150);
    if (await evaluate('document.querySelectorAll(".result-row:not(.filtered-out)").length') !== '') throw new Error('Review search did not hide nonmatching rows');
    await command('Emulation.setEmulatedMedia', { media: 'print' });
    if (await evaluate('[...document.querySelectorAll(".result-row")].filter(row => getComputedStyle(row).display !== "none").length') !== initialRows) throw new Error('Print omitted filtered tasks');
    await command('Emulation.setEmulatedMedia', { media: '' });
    await sleep(200);
    await clickButton('Filtreleri temizle');
    for (let i = 0; i < 30 && await evaluate('document.querySelectorAll(".result-row:not(.filtered-out)").length') !== initialRows; i++) await sleep(100);
    if (await evaluate('document.querySelectorAll(".result-row:not(.filtered-out)").length') !== initialRows) {
      const debugShot = await command('Page.captureScreenshot', { format: 'png' });
      require('node:fs').writeFileSync(join(process.env.SPRINTBOARD_REVIEW_SCREENSHOT_DIR || tmpdir(), 'review-reset.png'), Buffer.from(debugShot.data, 'base64'));
      throw new Error('Review reset failed: ' + await evaluate('JSON.stringify({query:document.querySelector("[data-testid=review-search]").value,rows:document.querySelectorAll(".result-row:not(.filtered-out)").length})'));
    }
    await setFieldValue('.review-filters select', 'BAU');
    await sleep(100);
    if (await evaluate('document.querySelectorAll(".result-row:not(.filtered-out)").length') !== 4) throw new Error('Review category filter failed');
    await navigate('sprints/legacy-sprint-13/review', 'Teslimatın büyük resmi');
    if (await evaluate('document.querySelector("app-sprint-review").innerText.includes("Canlı görünüm")')) throw new Error('Closed review still shows live status');
    if (await evaluate('document.querySelectorAll(".result-row:not(.filtered-out)").length') < 20) throw new Error('Review filters leaked across sprint navigation');
    for (const width of [1440, 390]) {
      await command('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
      await evaluate('window.scrollTo(0,0)');
      await sleep(120);
      if (await evaluate('document.documentElement.scrollWidth > innerWidth + 1')) throw new Error('Review horizontal page overflow at ' + width);
      if (process.env.SPRINTBOARD_REVIEW_SCREENSHOT_DIR) {
        const shot = await command('Page.captureScreenshot', { format: 'png' });
        require('node:fs').writeFileSync(join(process.env.SPRINTBOARD_REVIEW_SCREENSHOT_DIR, `review-${width}.png`), Buffer.from(shot.data, 'base64'));
        await evaluate('document.querySelector(".review-grid").scrollIntoView({block:"start"})');
        await sleep(100);
        const charts = await command('Page.captureScreenshot', { format: 'png' });
        require('node:fs').writeFileSync(join(process.env.SPRINTBOARD_REVIEW_SCREENSHOT_DIR, `review-charts-${width}.png`), Buffer.from(charts.data, 'base64'));
      }
    }
    await command('Emulation.clearDeviceMetricsOverride', {});
    if (process.env.SPRINTBOARD_SETUP === '1') {
      await navigate('settings', 'Göreli tahmin + efor');
      await evaluate('document.querySelector("input[value=POINTS_AND_HOURS]").click()');
      await clickButton('Tahmin yöntemini kaydet');
      for(let i=0;i<40&&!await evaluate('document.querySelector("main").innerText.includes("Tahmin yöntemi kaydedildi.")');i++)await sleep(100);
      await navigate('sprints/legacy-sprint-13/review', 'Story Point özeti');
      if (!await evaluate('document.querySelector("app-sprint-review").innerText.includes("işte SP belirtilmemiş")')) throw new Error('Review SP missing-data explanation absent');
      await navigate('settings', 'Göreli tahmin + efor');
      await evaluate('document.querySelector("input[value=SIZE_AND_HOURS]").click()');
      await clickButton('Tahmin yöntemini kaydet');
      for(let i=0;i<40&&!await evaluate('document.querySelector("main").innerText.includes("Tahmin yöntemi kaydedildi.")');i++)await sleep(100);
      await navigate('sprints/legacy-sprint-13/review', 'Size dağılımı');
    }
    if (events.length) throw new Error('Review browser errors: ' + events.join(' | '));
    console.log('Review: active/completed, summaries, filters/reset, print scope and responsive layout OK');
  }
  if (process.env.SPRINTBOARD_SMOKE_FIXES === '1') {
    if (process.env.SPRINTBOARD_SETUP !== '1') throw new Error('Fix workflow smoke requires an isolated setup database');
    const fixtures = JSON.parse(await evaluate(`(async () => {
      const session=await fetch('/api/auth/session').then(r=>r.json());
      const create=async title => { const response=await fetch('/api/roadmap',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-TOKEN':session.csrfToken},body:JSON.stringify({title,description:'Route test'})}); if(!response.ok) throw Error('Roadmap fixture failed'); return response.json(); };
      return JSON.stringify([await create('QA hedef A'),await create('QA hedef B')]);
    })()`));
    await navigate('roadmap/' + fixtures[0].id, 'QA hedef A');
    await navigate('roadmap/' + fixtures[1].id, 'QA hedef B');
    await navigate('roadmap/not-a-real-target', 'Roadmap hedefi bulunamadı');
    await navigate('roadmap', 'QA hedef A');
    const coverage=JSON.parse(await evaluate(`(async()=>{
      const [sprints,reports,overview]=await Promise.all(['/api/sprints','/api/reports','/api/overview'].map(url=>fetch(url).then(r=>r.json())));
      for(const report of reports){const sprint=sprints.find(s=>s.id===report.id);if(report.tasks!==sprint.deliveryTaskCount||report.done!==sprint.deliveryDoneCount)throw Error('Scope mismatch');}
      const total=reports.reduce((s,r)=>s+r.tasks,0),done=reports.reduce((s,r)=>s+r.done,0);
      if(overview.deliveryRate!==Math.round(done*100/total))throw Error('Overview/report rate mismatch');
      return JSON.stringify({sprints:sprints.length,rate:overview.deliveryRate});
    })()`));
    console.log('Common delivery scope:', coverage);
    await navigate('settings','Yedekleme ve geri yükleme');
    const backupText=await evaluate("fetch('/api/export').then(r=>r.text())");
    const backupPath=join(profile,'workspace-backup.json');
    require('node:fs').writeFileSync(backupPath,backupText);
    const snapshot=JSON.parse(backupText);
    if(snapshot.tables.app_user||!snapshot.tables.product_setting)throw new Error('Backup account/settings scope incorrect');
    await evaluate(`(async()=>{const session=await fetch('/api/auth/session').then(r=>r.json());const r=await fetch('/api/settings',{method:'PUT',headers:{'Content-Type':'application/json','X-CSRF-TOKEN':session.csrfToken},body:JSON.stringify({estimationMode:'POINTS_AND_HOURS'})});if(!r.ok)throw Error('Test setting change failed');})()`);
    const doc=await command('DOM.getDocument',{});
    const input=await command('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'[data-testid="backup-file"]'});
    await command('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[backupPath]});
    for(let i=0;i<40&&!await evaluate('document.querySelector("app-backup").innerText.includes("workspace-backup.json")');i++)await sleep(100);
    await clickButton('Yedeği doğrula ve önizle');
    for(let i=0;i<100&&!await evaluate('!!document.querySelector(".restore-preview")');i++)await sleep(100);
    if(!await evaluate('!!document.querySelector(".restore-preview")'))throw Error('Backup preview did not open: '+await evaluate('document.querySelector("app-backup").innerText'));
    if(process.env.SPRINTBOARD_FIXES_SCREENSHOT_DIR) {
      await evaluate('document.querySelector(".restore-preview").scrollIntoView({block:"center"})');
      const shot=await command('Page.captureScreenshot',{format:'png'});
      require('node:fs').writeFileSync(join(process.env.SPRINTBOARD_FIXES_SCREENSHOT_DIR,'backup-preview.png'),Buffer.from(shot.data,'base64'));
    }
    if(!await evaluate('[...document.querySelectorAll("app-backup button")].find(b=>b.textContent.trim()==="Yedeği uygula").disabled'))throw Error('Restore allowed without confirmation');
    await clickButton('Vazgeç', 'app-backup button');
    for(let i=0;i<40&&await evaluate('!!document.querySelector(".restore-preview")');i++)await sleep(100);
    if(await evaluate('!!document.querySelector(".restore-preview")'))throw Error('Restore cancel did not close preview');
    await clickButton('Yedeği doğrula ve önizle');
    for(let i=0;i<100&&!await evaluate('!!document.querySelector(".restore-preview")');i++)await sleep(100);
    await setFieldValue('[data-testid="restore-confirmation"]','GERİ YÜKLE');
    await clickButton('Yedeği uygula');
    for(let i=0;i<100&&!await evaluate('document.querySelector("app-backup").innerText.includes("Geri yükleme tamamlandı")');i++)await sleep(100);
    if(!await evaluate('document.querySelector("app-backup").innerText.includes("Geri yükleme tamamlandı")'))throw Error('Restore did not finish: '+await evaluate('document.querySelector("app-backup").innerText'));
    if(await evaluate("fetch('/api/settings').then(r=>r.json()).then(s=>s.estimationMode)")!=='SIZE_AND_HOURS')throw Error('Restored settings did not persist');
    await navigate('overview','TOPLAM SPRİNT');
    if(events.length)throw Error('Fix workflow browser errors: '+events.join(' | '));
    await navigate('backlog','İş listesi');
    await clickButton('+ Yeni iş');
    await setFieldValue('.modal input[name="title"]','QA editable backlog');
    await setFieldValue('.modal select[name="size"]','MEDIUM');
    await clickButton('İşi ekle');
    for(let i=0;i<40&&await evaluate('!!document.querySelector(".modal-layer")');i++)await sleep(100);
    await clickButton('QA editable backlog');
    if(!await evaluate('document.querySelector(".modal").innerText.includes("Kabul kriterleri")'))throw Error('Backlog detail missing criteria');
    await clickButton('İşi düzenle');
    await setFieldValue('.modal input[name="title"]','QA edited backlog');
    await setFieldValue('.modal textarea[name="criteria"]','Validated acceptance criteria');
    await setFieldValue('.modal input[name="estimatedHours"]','24');
    if(process.env.SPRINTBOARD_FIXES_SCREENSHOT_DIR) {
      const shot=await command('Page.captureScreenshot',{format:'png'});
      require('node:fs').writeFileSync(join(process.env.SPRINTBOARD_FIXES_SCREENSHOT_DIR,'backlog-edit.png'),Buffer.from(shot.data,'base64'));
    }
    await clickButton('Değişiklikleri kaydet');
    for(let i=0;i<40&&await evaluate('!!document.querySelector(".modal-layer")');i++)await sleep(100);
    await clickButton('QA edited backlog');
    if(!await evaluate('document.querySelector(".modal").innerText.includes("Validated acceptance criteria")'))throw Error('Backlog saved criteria missing');
    await clickButton('Kapat');
    if(events.length)throw Error('Backlog edit errors: '+events.join(' | '));
    console.log('Roadmap routes, metric consistency, backup upload/preview/cancel/confirm/restore and backlog edit: OK');
  }
  if (process.env.SPRINTBOARD_SMOKE_PLANNING === '1') {
    if(process.env.SPRINTBOARD_SETUP !== '1')throw Error('Planning smoke requires isolated database');
    await navigate('backlog','İş listesi');
    await clickButton('+ Yeni iş');
    await setFieldValue('.modal input[name="title"]','QA planning parent');
    await setFieldValue('.modal select[name="size"]','SMALL');
    await clickButton('İşi ekle');
    for(let i=0;i<40&&await evaluate('!!document.querySelector(".modal-layer")');i++)await sleep(100);
    await clickButton('+ Yeni iş');
    await setFieldValue('.modal input[name="title"]','QA planning child');
    await setFieldValue('.modal select[name="size"]','MEDIUM');
    await setFieldValue('.modal select[name="priority"]','URGENT');
    if(await evaluate('!!document.querySelector(".modal select[name=ownerId]")'))throw Error('Separate backlog owner should not be shown');
    await setFieldValue('.modal input[name="estimatedHours"]','16');
    await setFieldValue('.modal textarea[name="criteria"]','Planning acceptance');
    await setFieldValue('.modal input[name="dependencyQuery"]','QA planning parent');
    for(let i=0;i<40&&!await evaluate('!!document.querySelector(".dependency-options button")');i++)await sleep(100);
    if(!await evaluate('!!document.querySelector(".dependency-options button")'))throw Error('Dependency search did not render: '+await evaluate('document.querySelector(".modal").innerText'));
    await evaluate('document.querySelector(".dependency-options button").click()');
    if(!await evaluate('document.querySelector(".dependency-picker").innerText.includes("Kaldır")'))throw Error('Dependency selection missing');
    await clickButton('İşi ekle');
    for(let i=0;i<40&&await evaluate('!!document.querySelector(".modal-layer")');i++)await sleep(100);
    const item=JSON.parse(await evaluate("fetch('/api/backlog').then(r=>r.json()).then(items=>JSON.stringify(items.find(i=>i.title==='QA planning child')))"));
    if(item.priority!=='URGENT'||item.ownerId!=null||item.dependencies.length!==1||item.readiness.ready)throw Error('Planning fields did not persist');
    await clickButton('QA planning child');
    if(!await evaluate('document.querySelector(".modal").innerText.includes("Tamamlanmamış bağımlılık")'))throw Error('Readiness detail missing');
    await clickButton('Kapat');
    await evaluate('(()=>{const row=[...document.querySelectorAll("tbody tr")].find(r=>r.innerText.includes("QA planning child"));[...row.querySelectorAll("button")].find(b=>b.textContent.includes("Aktif sprinte al")).click()})()');
    for(let i=0;i<40&&!await evaluate('!!document.querySelector(".acknowledge")');i++)await sleep(100);
    if(!await evaluate('document.querySelector("app-sprint-add-dialog .primary").disabled'))throw Error('Warnings did not require acknowledgment');
    await clickButton('Vazgeç');
    if(await evaluate('!!document.querySelector(".modal-layer")'))throw Error('Readiness cancel failed');
    await navigate('sprints/legacy-sprint-14/planning','İşler ve atamalar');
    await clickButton('Backlog’dan iş ekle');
    for(let i=0;i<40&&!await evaluate('document.querySelectorAll("app-sprint-add-dialog option").length>1');i++)await sleep(100);
    await setFieldValue('app-sprint-add-dialog select',item.id);
    for(let i=0;i<40&&!await evaluate('!!document.querySelector(".acknowledge")');i++)await sleep(100);
    if(!await evaluate('!!document.querySelector(".acknowledge input")'))throw Error('Sprint readiness checkbox missing: '+await evaluate('document.querySelector("app-sprint-add-dialog")?.innerText'));
    await evaluate('document.querySelector(".acknowledge input").click()');
    if(await evaluate('document.querySelector("app-sprint-add-dialog .primary").disabled'))throw Error('Acknowledgment did not enable action');
    await clickButton('Sprinte ekle');
    for(let i=0;i<40&&await evaluate('!!document.querySelector(".modal-layer")');i++)await sleep(100);
    if(!await evaluate('document.querySelector("main").innerText.includes("QA planning child")'))throw Error('Added task not refreshed in sprint');
    await navigate('backlog','İş listesi');
    await clickButton('QA planning parent');await clickButton('İşi düzenle');
    if(process.env.SPRINTBOARD_PLANNING_SCREENSHOT_DIR){
      const shot=await command('Page.captureScreenshot',{format:'png'});require('node:fs').writeFileSync(join(process.env.SPRINTBOARD_PLANNING_SCREENSHOT_DIR,'planning-edit.png'),Buffer.from(shot.data,'base64'));
    }
    await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    const bounds=JSON.parse(await evaluate('(()=>{const m=document.querySelector(".modal").getBoundingClientRect();return JSON.stringify({top:m.top,bottom:m.bottom,width:m.width,height:innerHeight})})()'));
    if(bounds.top<0||bounds.bottom>bounds.height+1||bounds.width>390)throw Error('Planning modal outside mobile viewport');
    await clickButton('Vazgeç');await command('Emulation.clearDeviceMetricsOverride',{});
    if(events.length)throw Error('Planning browser errors: '+events.join(' | '));
    console.log('Planning: owner/priority/dependency create, detail, readiness gate/cancel/acknowledge, sprint refresh and mobile modal: OK');
  }
  if(process.env.SPRINTBOARD_SMOKE_SUBTYPES==='1'){
    if(process.env.SPRINTBOARD_SETUP!=='1')throw Error('Subtype smoke requires isolated database');
    await navigate('settings','İş alt türleri');await clickButton('+ Alt tür ekle');await clickButton('Vazgeç');
    if(await evaluate('!!document.querySelector(".modal-layer")'))throw Error('Subtype cancel failed');
    await clickButton('+ Alt tür ekle');await setFieldValue('select[name="subtypeCategory"]','TEST');await setFieldValue('input[name="subtypeLabel"]','Security QA');
    await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
    if(await evaluate('(()=>{const r=document.querySelector(".modal").getBoundingClientRect();return r.top<0||r.bottom>innerHeight+1||r.width>innerWidth})()'))throw Error('Subtype modal outside viewport');
    await clickButton('Alt türü kaydet');await command('Emulation.clearDeviceMetricsOverride',{});
    for(let i=0;i<40&&await evaluate('!!document.querySelector(".modal-layer")');i++)await sleep(100);
    const code=await evaluate("fetch('/api/task-subtypes').then(r=>r.json()).then(rows=>rows.find(r=>r.label==='Security QA').code)");
    await navigate('backlog','İş listesi');await clickButton('+ Yeni iş');
    await setFieldValue('select[name="taskCategory"]','TEST');await setFieldValue('select[name="taskSubtype"]',code);
    await setFieldValue('input[name="title"]','QA custom subtype task');await setFieldValue('select[name="size"]','SMALL');await clickButton('İşi ekle');
    for(let i=0;i<40&&await evaluate('!!document.querySelector(".modal-layer")');i++)await sleep(100);
    await evaluate('(()=>{const row=[...document.querySelectorAll("tbody tr")].find(r=>r.innerText.includes("QA custom subtype task"));[...row.querySelectorAll("button")].find(b=>b.textContent.includes("Aktif sprinte al")).click()})()');
    for(let i=0;i<40&&!await evaluate('!!document.querySelector(".acknowledge input")');i++)await sleep(100);
    await evaluate('document.querySelector(".acknowledge input").click()');await setFieldValue('[name=scopeReason]','Smoke kapsam gerekçesi');await clickButton('Sprinte ekle');
    for(let i=0;i<40&&await evaluate('!!document.querySelector(".modal-layer")');i++)await sleep(100);
    await navigate('settings','İş alt türleri');
    for(let i=0;i<40&&!await evaluate('[...document.querySelectorAll(".subtype-row-setting")].some(r=>r.innerText.includes("Security QA"))');i++)await sleep(100);
    await evaluate('(()=>{const row=[...document.querySelectorAll(".subtype-row-setting")].find(r=>r.innerText.includes("Security QA"));row.querySelector("button").click()})()');
    for(let i=0;i<40&&!await evaluate('[...document.querySelectorAll(".subtype-row-setting")].find(r=>r.innerText.includes("Security QA")).innerText.includes("Etkinleştir")');i++)await sleep(100);
    await navigate('backlog','İş listesi');await clickButton('+ Yeni iş');await setFieldValue('select[name="taskCategory"]','TEST');
    if(await evaluate('document.querySelector("select[name=taskSubtype]").innerText.includes("Security QA")'))throw Error('Inactive subtype available for new task');
    await clickButton('Vazgeç');
    await navigate('sprints/legacy-sprint-14/planning','İşler ve atamalar');
    await evaluate('(()=>{const row=[...document.querySelectorAll("tbody tr")].find(r=>r.innerText.includes("QA custom subtype task"));[...row.querySelectorAll("button")].find(b=>b.textContent.includes("Türü düzenle")).click()})()');
    if(!await evaluate('document.querySelector("select[name=classificationSubtype]").selectedOptions[0].textContent.includes("Security QA (pasif)")'))throw Error('Historic inactive subtype not preserved');
    await clickButton('İş tipini kaydet');
    for(let i=0;i<40&&await evaluate('!!document.querySelector(".modal-layer")');i++)await sleep(100);
    if(await evaluate('!!document.querySelector(".modal-layer")'))throw Error('Inactive existing classification cannot save');
    await navigate('sprints/legacy-sprint-14/review','Security QA');
    if(!await evaluate('document.body.innerText.includes("Security QA")'))throw Error('Review custom label missing');
    await navigate('reports','İş tipi ve alt kırılım analizi');
    for(let i=0;i<40&&!await evaluate('!!document.querySelector(".taxonomy-report-section select option[value=legacy-sprint-14]")');i++)await sleep(100);
    await setFieldValue('.taxonomy-report-section select','legacy-sprint-14');
    for(let i=0;i<40&&!await evaluate('document.querySelector(".taxonomy-breakdown-grid")?.innerText.includes("Security QA")');i++)await sleep(100);
    if(!await evaluate('document.querySelector(".taxonomy-breakdown-grid").innerText.includes("Security QA")'))throw Error('Report custom subtype missing');
    await navigate('settings','İş alt türleri');
    for(let i=0;i<40&&!await evaluate('document.querySelectorAll(".subtype-row-setting").length>0');i++)await sleep(100);
    await evaluate('document.querySelector("app-subtype-settings").scrollIntoView({block:"start"});window.scrollBy(0,-90)');
    if(process.env.SPRINTBOARD_SUBTYPE_SCREENSHOT){const shot=await command('Page.captureScreenshot',{format:'png'});require('node:fs').writeFileSync(process.env.SPRINTBOARD_SUBTYPE_SCREENSHOT,Buffer.from(shot.data,'base64'));}
    if(events.length)throw Error('Subtype browser errors: '+events.join(' | '));
    console.log('Subtype: create/cancel, mobile modal, assign, deactivate, new-choice exclusion, historic editing, Review/report labels: OK');
  }
  if(process.env.SPRINTBOARD_SMOKE_DEFECT==='1'){
    if(process.env.SPRINTBOARD_SETUP!=='1')throw Error('Defect smoke requires isolated database');
    await navigate('backlog','İş listesi');await clickButton('+ Yeni iş');
    if(await evaluate('!!document.querySelector("app-defect-fields")'))throw Error('DEV form exposes defect fields');
    await setFieldValue('.modal select[name="taskCategory"]','DEFECT');
    await setFieldValue('.modal select[name="taskSubtype"]','TEST_DEFECT');
    await setFieldValue('.modal input[name="title"]','QA defect lifecycle');await setFieldValue('.modal select[name="size"]','SMALL');
    await setFieldValue('select[name="defectSeverity"]','CRITICAL');await setFieldValue('select[name="defectEnvironment"]','UAT');await setFieldValue('select[name="defectVerification"]','PENDING');
    await setFieldValue('textarea[name="defectNote"]','Reproduction checked');await clickButton('İşi ekle');
    for(let i=0;i<40&&await evaluate('!!document.querySelector(".modal-layer")');i++)await sleep(100);
    const defect=JSON.parse(await evaluate("fetch('/api/backlog').then(r=>r.json()).then(a=>JSON.stringify(a.find(i=>i.title==='QA defect lifecycle')))"));
    if(defect.defect.severity!=='CRITICAL'||defect.defect.environment!=='UAT'||defect.defect.verification!=='PENDING')throw Error('Defect create failed');
    await clickButton('QA defect lifecycle');
    if(!await evaluate('document.querySelector(".modal").innerText.includes("Kritik · UAT · Doğrulama bekliyor")'))throw Error('Defect detail missing');
    await clickButton('Kapat');
    await evaluate('(()=>{const row=[...document.querySelectorAll("tbody tr")].find(r=>r.innerText.includes("QA defect lifecycle"));[...row.querySelectorAll("button")].find(b=>b.textContent.includes("Aktif sprinte al")).click()})()');
    for(let i=0;i<40&&!await evaluate('!!document.querySelector(".acknowledge input")');i++)await sleep(100);
    await evaluate('document.querySelector(".acknowledge input").click()');await clickButton('Sprinte ekle');
    for(let i=0;i<40&&await evaluate('!!document.querySelector(".modal-layer")');i++)await sleep(100);
    await navigate('sprints/legacy-sprint-14/planning','İşler ve atamalar');
    async function openDefect(){await evaluate('(()=>{const row=[...document.querySelectorAll("tbody tr")].find(r=>r.innerText.includes("QA defect lifecycle"));[...row.querySelectorAll("button")].find(b=>b.textContent.includes("Defect takibi")).click()})()');for(let i=0;i<40&&!await evaluate('!!document.querySelector("app-defect-dialog app-defect-fields")');i++)await sleep(100);}
    await openDefect();await setFieldValue('select[name="defectVerification"]','FAILED');await clickButton('Vazgeç');
    await openDefect();if(await evaluate('document.querySelector("select[name=defectVerification]").value')!=='PENDING')throw Error('Cancel saved defect changes');
    await setFieldValue('select[name="defectVerification"]','PASSED');await setFieldValue('textarea[name="defectNote"]','Fixed and verified');
    if(process.env.SPRINTBOARD_DEFECT_SCREENSHOT_DIR){const shot=await command('Page.captureScreenshot',{format:'png'});require('node:fs').writeFileSync(join(process.env.SPRINTBOARD_DEFECT_SCREENSHOT_DIR,'defect-edit.png'),Buffer.from(shot.data,'base64'));}
    await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
    if(await evaluate('(()=>{const r=document.querySelector("app-defect-dialog .modal").getBoundingClientRect();return r.top<0||r.bottom>innerHeight+1||r.width>innerWidth})()'))throw Error('Defect modal outside viewport');
    await clickButton('Defect bilgilerini kaydet');
    for(let i=0;i<40&&await evaluate('!!document.querySelector(".modal-layer")');i++)await sleep(100);
    await command('Emulation.clearDeviceMetricsOverride',{});
    const saved=JSON.parse(await evaluate("fetch('/api/backlog').then(r=>r.json()).then(a=>JSON.stringify(a.find(i=>i.title==='QA defect lifecycle')))"));
    if(saved.taskStatus!=='todo'||saved.defect.verification!=='PASSED'||!saved.defect.verifiedAt)throw Error('Verification changed task status or did not persist');
    await navigate('reports','Defect analizi');
    await setFieldValue('app-defect-report .defect-filters label:nth-child(3) select','CRITICAL');await setFieldValue('app-defect-report .defect-filters label:nth-child(4) select','UAT');
    for(let i=0;i<40&&!await evaluate('document.querySelector(".defect-metrics").innerText.includes("1 defect")');i++)await sleep(100);
    if(!await evaluate('document.querySelector(".defect-metrics").innerText.includes("1 defect")'))throw Error('Defect report filtering/count incorrect');
    await evaluate('document.querySelector("app-defect-report").scrollIntoView({block:"start"})');
    if(process.env.SPRINTBOARD_DEFECT_SCREENSHOT_DIR){const shot=await command('Page.captureScreenshot',{format:'png'});require('node:fs').writeFileSync(join(process.env.SPRINTBOARD_DEFECT_SCREENSHOT_DIR,'defect-report.png'),Buffer.from(shot.data,'base64'));}
    await setFieldValue('app-defect-report .defect-filters label:nth-child(5) select','FAILED');
    if(!await evaluate('document.querySelector("app-defect-report").innerText.includes("Bu kapsamda defect bulunamadı")'))throw Error('Defect empty filter failed');
    if(events.length)throw Error('Defect browser errors: '+events.join(' | '));
    console.log('Defect: conditional fields, create/detail, cancel/edit, independent verification, report filters/charts and mobile modal: OK');
  }
  if(process.env.SPRINTBOARD_SMOKE_RETRO==='1'){
    if(process.env.SPRINTBOARD_SETUP!=='1')throw Error('Retro smoke requires isolated database');
    await navigate('sprints/legacy-sprint-13/retro','Aksiyon takibi');
    await clickButton('+ Retro aksiyonu');await setFieldValue('input[name="actionTitle"]','Unsaved retro');await clickButton('Vazgeç');
    if(await evaluate('document.querySelectorAll(".retro-action").length')!=='')throw Error('Cancelled action was saved');
    await clickButton('+ Retro aksiyonu');
    await setFieldValue('input[name="actionTitle"]','QA retro improvement');await setFieldValue('textarea[name="actionDescription"]','Improve regression coverage');
    await setFieldValue('select[name="actionOwner"]','legacy-member-akin');await setFieldValue('input[name="actionDue"]','2000-01-01');
    for(const width of [1440,390]){
      await command('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:false});
      if(await evaluate('(()=>{const r=document.querySelector(".retro-modal").getBoundingClientRect();return r.top<0||r.bottom>innerHeight+1||r.width>innerWidth})()'))throw Error('Retro modal outside viewport');
    }
    await clickButton('Aksiyonu kaydet');await command('Emulation.clearDeviceMetricsOverride',{});
    for(let i=0;i<40&&await evaluate('!!document.querySelector(".modal-layer")');i++)await sleep(100);
    if(!await evaluate('document.querySelector(".retro-action")?.innerText.includes("Gecikti")'))throw Error('Overdue action not shown');
    await setFieldValue('select[name="retroStatusFilter"]','DONE');
    if(!await evaluate('document.querySelector("app-retro").innerText.includes("Filtreye uygun aksiyon yok")'))throw Error('Retro status filter failed');
    await clickButton('Filtreleri temizle');await setFieldValue('input[name="retroQuery"]','no-match-retro');
    if(!await evaluate('document.querySelector("app-retro").innerText.includes("Filtreye uygun aksiyon yok")'))throw Error('Retro search failed');
    await clickButton('Filtreleri temizle');
    await clickButton('Aksiyonu düzenle');await setFieldValue('input[name="actionTitle"]','Must not save');await clickButton('Vazgeç');
    if(await evaluate('document.querySelector(".retro-action").innerText.includes("Must not save")'))throw Error('Retro edit cancel persisted');
    await clickButton('Backlog işi oluştur');await clickButton('Vazgeç');await clickButton('Backlog işi oluştur');
    await setFieldValue('select[name="retroBacklogSize"]','MEDIUM');await setFieldValue('input[name="retroBacklogHours"]','8');await clickButton('Backlog işini oluştur');
    for(let i=0;i<40&&await evaluate('!!document.querySelector(".modal-layer")');i++)await sleep(100);
    if(!await evaluate('document.querySelector(".retro-backlog").innerText.includes("QA retro improvement")'))throw Error('Retro backlog creation missing');
    await evaluate('document.querySelector(".retro-backlog a").click()');
    for(let i=0;i<40&&!await evaluate('document.querySelector(".modal")?.innerText.includes("QA retro improvement")');i++)await sleep(100);
    if(!await evaluate('document.querySelector(".modal")?.innerText.includes("QA retro improvement")'))throw Error('Linked backlog deep link failed');
    await clickButton('Kapat');
    await navigate('sprints/legacy-sprint-13/retro','QA retro improvement');await clickButton('Aksiyonu düzenle');await setFieldValue('select[name="actionStatus"]','DONE');await clickButton('Aksiyonu kaydet');
    for(let i=0;i<40&&await evaluate('!!document.querySelector(".modal-layer")');i++)await sleep(100);
    if(await evaluate('document.querySelector(".retro-action").innerText.includes("Gecikti")'))throw Error('Completed action still overdue');
    const state=JSON.parse(await evaluate("fetch('/api/sprints/legacy-sprint-13/retro/actions').then(r=>r.json()).then(a=>JSON.stringify(a.find(i=>i.title==='QA retro improvement')))"));
    if(state.status!=='DONE'||state.backlogState!=='Ready'||state.linkedSprintId)throw Error('Retro completion affected backlog or sprint');
    await evaluate('document.querySelector(".retro-notes summary").click()');await setFieldValue('textarea[name="retroLegacyActions"]','Preserved free text');await clickButton('Retro notlarını kaydet');
    for(let i=0;i<40&&!await evaluate('document.querySelector("app-retro").innerText.includes("Retro notları kaydedildi.")');i++)await sleep(100);
    await navigate('sprints/legacy-sprint-14/retro','Aksiyon takibi');
    if(await evaluate('document.querySelector(".retro-list").innerText.includes("QA retro improvement")'))throw Error('Actions leaked across sprint navigation');
    await clickButton('+ Retro aksiyonu');await navigate('sprints/legacy-sprint-13/retro','QA retro improvement');
    if(await evaluate('!!document.querySelector(".retro-modal")'))throw Error('Retro modal leaked across sprint navigation');
    await evaluate('document.querySelector(".retro-notes summary").click()');
    if(await evaluate('document.querySelector("textarea[name=retroLegacyActions]").value')!=='Preserved free text')throw Error('Historical notes lost');
    await evaluate('document.querySelector(".retro-notes summary").click()');
    for(const width of [1440,390]){
      await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
      await evaluate('window.scrollTo(0,0)');await sleep(100);
      if(await evaluate('document.documentElement.scrollWidth>innerWidth+1'))throw Error('Retro horizontal overflow');
      if(process.env.SPRINTBOARD_RETRO_SCREENSHOT_DIR){const shot=await command('Page.captureScreenshot',{format:'png'});require('node:fs').writeFileSync(join(process.env.SPRINTBOARD_RETRO_SCREENSHOT_DIR,'retro-'+width+'.png'),Buffer.from(shot.data,'base64'));}
    }
    await command('Emulation.clearDeviceMetricsOverride',{});
    if(events.length)throw Error('Retro browser errors: '+events.join(' | '));
    console.log('Retro: create/edit/cancel, overdue/filter, linked backlog/deep link, independent status, notes, cross-sprint isolation and mobile: OK');
  }
  if(process.env.SPRINTBOARD_SMOKE_CLOSURE==='1'){
    if(process.env.SPRINTBOARD_SETUP!=='1')throw Error('Closure smoke requires isolated database');
    const fixture=JSON.parse(await evaluate(`(async()=>{const session=await fetch('/api/auth/session').then(r=>r.json());const s=await fetch('/api/sprints/legacy-sprint-14').then(r=>r.json());const t=s.items.find(t=>!t.externalId.startsWith('BAU-AUTO:'));const r=await fetch('/api/tasks/'+t.id,{method:'PATCH',headers:{'Content-Type':'application/json','X-CSRF-TOKEN':session.csrfToken},body:JSON.stringify({status:'done'})});if(!r.ok)throw Error('Fixture status failed');return JSON.stringify({doneId:t.id});})()`));
    await navigate('sprints/legacy-sprint-14/summary','Sprint planı');
    await clickButton('Sprinti tamamla');
    for(let i=0;i<40&&!await evaluate('!!document.querySelector(".closure-confirm")');i++)await sleep(100);
    if(!await evaluate('document.querySelector(".closure-modal .primary").disabled'))throw Error('Closure allowed without confirmation');
    await clickButton('Vazgeç');
    if(await evaluate('!!document.querySelector(".closure-modal")'))throw Error('Closure cancel failed');
    if(await evaluate("fetch('/api/sprints/legacy-sprint-14').then(r=>r.json()).then(s=>s.status)")!=='active')throw Error('Cancel mutated sprint');
    await clickButton('Sprinti tamamla');
    for(let i=0;i<40&&!await evaluate('!!document.querySelector(".closure-confirm")');i++)await sleep(100);
    await evaluate('document.querySelector(".closure-confirm input").click()');
    await evaluate(`(async()=>{const session=await fetch('/api/auth/session').then(r=>r.json());await fetch('/api/sprints/legacy-sprint-14/capacity/legacy-member-akin',{method:'PUT',headers:{'Content-Type':'application/json','X-CSRF-TOKEN':session.csrfToken},body:JSON.stringify({allocatedDays:5})});})()`);
    await clickButton('Onayla ve kapat');
    for(let i=0;i<40&&!await evaluate('document.querySelector(".closure-modal")?.innerText.includes("Kapanış bilgileri değişti")');i++)await sleep(100);
    if(!await evaluate('document.querySelector(".closure-modal")?.innerText.includes("Kapanış bilgileri değişti")'))throw Error('Stale preview was not rejected');
    if(!await evaluate('document.querySelector(".closure-modal .primary").disabled'))throw Error('Stale preview retained confirmation');
    await evaluate('document.querySelector(".closure-modal details").open=true');
    await evaluate('document.querySelector('+JSON.stringify('[data-task-id="'+fixture.doneId+'"] input')+').click()');
    const expected=Number(await evaluate('document.querySelectorAll(".closure-row input:checked").length'));
    for(const width of [1440,390]){
      await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
      const bounds=JSON.parse(await evaluate('(()=>{const m=document.querySelector(".closure-modal").getBoundingClientRect();return JSON.stringify({top:m.top,bottom:m.bottom,width:m.width,height:innerHeight})})()'));
      if(bounds.top<0||bounds.bottom>bounds.height+1||bounds.width>width)throw Error('Closure modal overflow at '+width);
      if(process.env.SPRINTBOARD_CLOSURE_SCREENSHOT_DIR){const shot=await command('Page.captureScreenshot',{format:'png'});require('node:fs').writeFileSync(join(process.env.SPRINTBOARD_CLOSURE_SCREENSHOT_DIR,'closure-'+width+'.png'),Buffer.from(shot.data,'base64'));}
    }
    await command('Emulation.clearDeviceMetricsOverride',{});
    await evaluate('document.querySelector(".closure-confirm input").click()');await clickButton('Onayla ve kapat');
    for(let i=0;i<60&&!await evaluate('!!document.querySelector("[data-testid=closure-frozen]")');i++)await sleep(100);
    if(!await evaluate('!!document.querySelector("[data-testid=closure-frozen]")'))throw Error('Closure result did not refresh: '+await evaluate('document.querySelector("main").innerText'));
    const verified=await evaluate(`(async()=>{const backup=await fetch('/api/export').then(r=>r.json());const row=backup.tables.sprint_closure.find(r=>r.sprint_id==='legacy-sprint-14');const p=JSON.parse(row.payload_json);if(p.carried.length!==${expected}||!p.carried.some(c=>c.taskId===${JSON.stringify(fixture.doneId)}&&c.reason==='repeat'))throw Error('Carry decisions lost');return true;})()`);
    if(!verified)throw Error('Missing closure record');
    // One 400 is expected for the intentionally stale close request; all others remain failures.
    const unexpected=events.filter(e=>!e.includes('400 http://127.0.0.1:4183/api/sprints/legacy-sprint-14/complete')&&!e.includes('Failed to load resource: the server responded with a status of 400'));
    if(unexpected.length)throw Error('Closure browser errors: '+unexpected.join(' | '));
    console.log('Closure: preview/cancel, stale rejection, done repeat, BAU exclusion, explicit confirmation, frozen Review, snapshot export and mobile bounds: OK');
  }
  ws.close();
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => browser.kill());
