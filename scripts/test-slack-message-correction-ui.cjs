const assert=require('node:assert/strict');
module.exports=async({evaluate,command,navigate,clickButton,setFieldValue,waitFor,shot,api,sleep})=>{
 for(const backlog of [true,false]){
  const component=backlog?'app-slack-backlog-inbox':'app-slack-inbox',path='/admin/slack/'+(backlog?'backlog-inbox':'inbox');
  await navigate('backlog','İş listesi');
  await waitFor('document.querySelectorAll("'+component+' .entry-head").length>0');
  if(backlog)await evaluate('document.querySelector("app-slack-backlog-inbox > details").open=true');else await evaluate('document.querySelector("app-slack-inbox").closest("details").open=true');
  const invalid=(await api(path)).items.find(p=>p.status==='INVALID');assert(invalid);const before=(await api('/backlog')).length;
  await evaluate('[...document.querySelectorAll('+JSON.stringify(component+' .entry-head')+')].find(b=>b.querySelector("strong").textContent==='+JSON.stringify(invalid.title)+').click()');
  await clickButton('Mesajı düzelt',component+' button');assert.equal(Number(await evaluate('document.querySelectorAll('+JSON.stringify(component+' [aria-label="'+(backlog?'İstek Size':'Defect Size')+'"]')+').length')),0);
  await clickButton('Düzeltmeden vazgeç',component+' button');assert.equal((await api(path)).items.find(p=>p.id===invalid.id).status,'INVALID');
  await clickButton('Mesajı düzelt',component+' button');
  const title=backlog?'Düzeltilmiş backlog UI':'Düzeltilmiş defect UI',text=backlog?'#backlog\nTür: DEV\nBaşlık: '+title+'\nAçıklama: Düzeltilmiş açıklama':'#defect\nTür: PROD\nBaşlık: '+title+'\nOrtam: PROD\nÖnem: CRITICAL\nHedef: BACKLOG';
  await setFieldValue(component+' [aria-label="Düzeltilmiş Slack mesajı"]',text);
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});await sleep(100);await evaluate('document.querySelector('+JSON.stringify(component+' app-slack-message-correction')+').scrollIntoView({block:"center"})');assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));await shot((backlog?'backlog':'defect')+'-correction-mobile');await command('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await clickButton('Doğrula ve kaydet',component+' button');
  const size=component+' [aria-label="'+(backlog?'İstek Size':'Defect Size')+'"]';await waitFor('!!document.querySelector('+JSON.stringify(size)+')');
  const pending=(await api(path)).items.find(p=>p.id===invalid.id);assert.equal(pending.status,'PENDING');assert.equal(pending.originalRaw,invalid.raw);assert.equal(pending.raw,text);assert.equal((await api('/backlog')).length,before);
  await setFieldValue(size,'SMALL');await shot((backlog?'backlog':'defect')+'-correction-approval');await clickButton('Onayla ve backlog’a ekle',component+' button');
  await waitFor('!document.querySelector('+JSON.stringify(component+' .entry-body')+')');
  const approved=(await api(path+'?filter=APPROVED')).items.find(p=>p.id===invalid.id);assert(approved);const items=await api('/backlog');assert.equal(items.length,before+1);assert.equal(items.find(p=>p.id===approved.backlogId).title,title);
 }
 console.log('PASS: invalid defect/backlog correction, cancel, separate approval, original retained, mobile layout, one item created per approval.');
};
