import type {Sprint} from '../api.service';
export function supportDefects(sprint:Sprint){return sprint.items.filter(t=>t.taskCategory==='DEFECT'&&!!t.reserveTaskId);}
export function supportDefectsHtml(sprint:Sprint):string{
 const tasks=supportDefects(sprint);if(!tasks.length)return '';
 const done=tasks.filter(t=>t.status==='done').length;
 const groups=[{key:'TEST_DEFECT',label:'Test Defect'},{key:'PROD_DEFECT',label:'Prod Defect'},{key:'OTHER',label:'Diğer / belirtilmemiş'}].map(g=>{
 const rows=tasks.filter(t=>g.key==='OTHER'?!['TEST_DEFECT','PROD_DEFECT'].includes(t.taskSubtype||''):t.taskSubtype===g.key);
 const closed=rows.filter(t=>t.status==='done').length,undone=rows.filter(t=>t.status==='undone').length;
 return {...g,count:rows.length,done:closed,undone,open:rows.length-closed-undone};
 }).filter(g=>g.key!=='OTHER'||g.count);
 return '<section class="section support-defects" style="margin:24px 0;padding:24px;border:1px solid #dce5f0;border-radius:14px;background:white;color:#17324f"><small>DEFECT SUPPORT</small><h2>Defect Support kapsamında alınan işler</h2><p>'+tasks.length+' defect · '+done+' Done · %'+Math.round(done/tasks.length*100)+' tamamlandı</p><div class="support-summary-grid" style="display:flex;flex-wrap:wrap;gap:16px">'+groups.map(g=>'<article class="support-summary-card" style="flex:1;min-width:180px;border:1px solid #dce5f0;border-radius:12px;padding:18px"><h3>'+g.label+'</h3><p><strong>'+g.count+'</strong> defect · '+(g.count?'%'+Math.round(g.done/g.count*100):'—')+' Done</p><p>'+g.done+' Done · '+g.open+' Açık · '+g.undone+' Undone</p><progress max="'+Math.max(1,g.count)+'" value="'+g.done+'" aria-label="'+g.label+' tamamlanma" style="width:100%;accent-color:#0d9274"></progress></article>').join('')+'</div><p><small>Açık: Yapılacak + devam ediyor. Done, çözülmüş/kapanmış kabul edilir. Yalnız Defect Support rezervine bağlı işler.</small></p></section>';
}

