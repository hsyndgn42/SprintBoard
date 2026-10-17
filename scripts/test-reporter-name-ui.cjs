module.exports=async({evaluate,command,navigate,clickButton,setFieldValue,sleep,events})=>{
 const assert=require('node:assert/strict'),fs=require('node:fs');
 async function wait(expr){for(let i=0;i<100;i++){if(await evaluate(expr))return;await sleep(100);}throw Error('Timeout '+expr);}
 await navigate('backlog','Backlog');await wait('!!document.querySelector("app-slack-inbox select")');
 await setFieldValue('select[aria-label="Slack kuyruk görünümü"]','APPROVED');await wait('document.querySelectorAll("app-slack-inbox .entry-head").length===2');
 await evaluate('document.querySelector("app-slack-inbox .entry-head").click()');await wait('!!document.querySelector("app-slack-inbox .entry-body")');
 assert(await evaluate('document.querySelector("app-slack-inbox .entry-body").innerText.includes("Ada Yılmaz")'));assert(!await evaluate('document.querySelector("app-slack-inbox .entry-body").innerText.includes("UTEST123")'));
 await navigate('reports','Raporlar');await clickButton('Defect');await wait('!!document.querySelector("app-defect-report details")');await evaluate('Array.from(document.querySelectorAll("app-defect-report summary")).find(e=>e.textContent.includes("Defect iş listesi")).parentElement.open=true');await wait('document.querySelector("app-defect-report").innerText.includes("Ada Yılmaz")');
 assert(await evaluate('document.querySelector("app-defect-report").innerText.includes("Ada Yılmaz")'));assert(!await evaluate('document.querySelector("app-defect-report").innerText.includes("UTEST123")'));
 await evaluate('window.__nameExports=[];const original=URL.createObjectURL;URL.createObjectURL=b=>{b.text().then(t=>window.__nameExports.push(t));return original(b)};HTMLAnchorElement.prototype.click=function(){}');
 await clickButton('HTML indir');await wait('window.__nameExports.length===1');assert(await evaluate('window.__nameExports[0].includes("Ada Yılmaz")'));assert(!await evaluate('window.__nameExports[0].includes("UTEST123")'));
 fs.mkdirSync('tmp/reporter-name-ui',{recursive:true});await evaluate('document.querySelector("app-defect-report details").scrollIntoView({block:"center"})');
 fs.writeFileSync('tmp/reporter-name-ui/report.png',Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'));
 assert.equal(events.length,0,events.join('\n'));console.log('Reporter names UI PASS: inbox, report and HTML show full name, no Slack ID.');
};
