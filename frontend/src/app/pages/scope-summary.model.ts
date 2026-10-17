import {effectiveTaskStatus} from '../task-lifecycle';
import type {Sprint,Task} from '../api.service';
import {isLeave} from './review.model';

const h=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const date=(v:string)=>new Intl.DateTimeFormat('tr-TR',{dateStyle:'medium',timeZone:'Europe/Istanbul'}).format(new Date(v));
const n=(v:number)=>new Intl.NumberFormat('tr-TR',{maximumFractionDigits:1}).format(v);
export const scopeEffort=(t:Task)=>isLeave(t)?0:t.assignments.length?t.assignments.reduce((n,a)=>n+(a.supportOnly?0:Math.max(0,a.planningHours??a.estimatedHours??0)),0):Math.max(0,t.planningHours??t.estimatedHours??0);
const effort=scopeEffort;
const sum=(tasks:Task[])=>tasks.reduce((s,t)=>s+(isLeave(t)?0:effort(t)),0);
const state=(s:string)=>({done:'Done',undone:'Undone',doing:'Devam ediyor',todo:'Yapılacak',removed:'Kapsamdan çıkarıldı'}[s]||s);
export function buildScope(sprint:Sprint){
 const flow=sprint.flow,tracked=!!flow&&flow.origin!=='UNTRACKED';
 const added=flow?.events.filter(e=>e.action==='ADDED')||[],removed=flow?.events.filter(e=>e.action==='REMOVED')||[];
 const emergencies=added.filter(e=>(sprint.items.find(t=>t.id===e.task.id)||removed.find(r=>r.task.id===e.task.id)?.task||e.task).emergency).map(e=>{
  const out=removed.find(r=>r.task.id===e.task.id),current=sprint.items.find(t=>t.id===e.task.id);
  const task=current||out?.task||e.task;
  return {task,reason:e.reason,at:e.at,result:out?'removed':current?effectiveTaskStatus(current):'unknown',hours:isLeave(task)?0:task.taskCategory==='DEFECT'&&task.extraPlanHours!=null?task.extraPlanHours:effort(task)};
 });
 return {tracked,baseline:flow?.baseline||[],added,removed,emergencies,
  baselineHours:sum(flow?.baseline||[]),addedHours:sum(added.map(e=>e.task)),removedHours:sum(removed.map(e=>e.task)),
  currentHours:sum(sprint.items),emergencyHours:emergencies.reduce((s,e)=>s+e.hours,0)};
}
export const scopeCss=`
.scope-summary{margin:24px 0;padding:24px;border:1px solid #dce5f0;border-radius:14px;background:white;color:#17324f;min-width:0;font:14px/1.6 'Segoe UI',Arial,sans-serif}.scope-summary h2{font-size:21px;margin:0 0 8px}.scope-summary h3{font-size:15px;margin:24px 0 12px}.scope-summary p{font-size:12px;color:#61758e}.scope-summary .scope-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:18px 0}.scope-summary .scope-kpis>div{padding:14px;border:1px solid #e2e9f2;border-radius:10px;background:#f8fbff}.scope-summary small{display:block;font-size:11px;color:#61758e}.scope-summary strong{overflow-wrap:anywhere}.scope-summary .scope-kpis strong{display:block;font-size:24px}.scope-summary .scope-bars{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 24px}.scope-summary .scope-bar{display:grid;grid-template-columns:135px 1fr 30px;gap:10px;align-items:center;font-size:12px}.scope-summary .scope-track{display:flex;height:12px;gap:1px;border-radius:4px;overflow:hidden;background:#edf1f6}.scope-summary .scope-track i{flex:1;background:#edf1f6}.scope-summary .scope-track i.filled{background:#d18a2c}.scope-summary .scope-track.done i.filled{background:#13866c}.scope-summary .scope-track.undone i.filled{background:#c34c42}.scope-summary .scope-track.doing i.filled{background:#397cc5}.scope-summary .scope-track.removed i.filled{background:#8092a7}.scope-summary .scope-list{list-style:none;padding:0}.scope-summary .scope-list li{padding:14px 0;border-bottom:1px solid #e2e9f2;break-inside:avoid}.scope-summary .scope-list span{display:block;font-size:12px;overflow-wrap:anywhere}.scope-summary .scope-list p{margin:5px 0;white-space:pre-wrap;overflow-wrap:anywhere}.scope-summary .scope-tag{display:inline-block!important;background:#fff1dc;color:#925510;padding:2px 8px;border-radius:6px;font-size:11px!important}.scope-summary .scope-notice{padding:12px;background:#f2f6fb;border-radius:8px}.scope-summary .scope-caption{font-weight:600;color:#1762a4}@media(max-width:650px){.scope-summary{padding:16px}.scope-summary .scope-kpis{grid-template-columns:1fr 1fr}.scope-summary .scope-bars{grid-template-columns:1fr}.scope-summary .scope-bar{grid-template-columns:125px 1fr 28px}}@media print{.scope-summary{margin:16px 0;padding:16px}.scope-summary .scope-kpis{grid-template-columns:repeat(4,1fr)}.scope-summary h2,.scope-summary h3{break-after:avoid}.scope-summary .scope-kpis,.scope-summary .scope-bars{break-inside:avoid}}
`;
export function scopeSectionHtml(sprint:Sprint):string{
 const m=buildScope(sprint),flow=sprint.flow;
 const count=(label:string,value:string,hours:string)=>`<div><small>${h(label)}</small><strong>${h(value)}</strong><small>${h(hours)}</small></div>`;
 const list=(rows:string[])=>`<ul class="scope-list">${rows.join('')}</ul>`;
 return `<section class="scope-summary"><h2>Acil işler ve kapsam değişimi</h2><p class="scope-caption">${h(sprint.name)} · ${sprint.status==='completed'?'Kapanmış sprint':'Güncel plan'}</p>
 ${!m.tracked?'<p class="scope-notice">Bu sprint için kapsam değişimi takibi yok. Acil iş veya başlangıç kapsamı geçmişi bilinmiyor; sıfır değişim olarak yorumlanmamalı.</p>':`<p>${flow?.origin==='START'?'Sprint başlangıç planı':'Sprint devam ederken alınan takip başlangıcı; önceki değişiklikler bilinmiyor.'}</p>
 <div class="scope-kpis">${count(flow?.origin==='START'?'Başlangıç planı':'Takip başlangıcı',m.baseline.length+' iş',n(m.baselineHours)+' sa')}${count('Sonradan eklenen','+'+m.added.length+' iş',n(m.addedHours)+' sa · ekleme anında')}${count('Backlog’a dönen','−'+m.removed.length+' iş',n(m.removedHours)+' sa · çıkarma anında')}${count('Güncel kapsam',sprint.items.length+' iş',n(m.currentHours)+' sa')}</div>
 <p>BAU dahil; Leave saat toplamlarına dahil değildir. BAU otomatik Done kabul edilir. Planlanan efor gösterilir, gerçekleşen süre değildir. Atama varsa kişi saatleri, yoksa iş tahmini kullanılır; X destek 0 saattir. Defect Support yalnız kalan rezerviyle sayılır. Rezerv dağıtımı ve atama değişiklikleri nedeniyle başlangıç + eklenen − çıkarılan saat, güncel plana eşit olmayabilir.</p>
 <h3>Acil / plansız işler · ${m.emergencies.length} iş · ${n(m.emergencyHours)} sa</h3><p>Defectlerde yalnız rezerv dışı ek plan saatleri gösterilir; rezervden karşılanan bölüm acil toplama eklenmez. Kişi rezervi sprint giriş sırasıyla paylaşılır.</p>
 <div class="scope-bars">${['done','undone','doing','todo','removed'].map(s=>{const c=m.emergencies.filter(e=>e.result===s).length;return `<div class="scope-bar"><span>${state(s)}</span><span class="scope-track ${s}" role="img" aria-label="${state(s)}: ${c} iş">${Array.from({length:20},(_,i)=>`<i class="${i<Math.round(20*c/Math.max(1,m.emergencies.length))?'filled':''}"></i>`).join('')}</span><b>${c}</b></div>`;}).join('')}</div>
 ${m.emergencies.length?list(m.emergencies.map(e=>`<li><strong>${h(e.task.name)}</strong> <span class="scope-tag">${h(state(e.result))}</span><span>${n(e.hours)} sa · ${h(date(e.at))}</span><p>Geliş gerekçesi: ${h(e.reason)}</p></li>`)):'<p>Takip edilen kapsamda acil olarak işaretlenmiş iş yok.</p>'}
 <h3>Backlog’a geri gönderilen işler · ${m.removed.length}</h3>
 ${m.removed.length?list(m.removed.map(e=>`<li><strong>${h(e.task.name)}</strong><span>${n(isLeave(e.task)?0:effort(e.task))} sa · ${h(date(e.at))} · Kapsamdan çıkarıldı, Undone değil</span><p>${h(e.reason)}</p>${e.task.replacementTaskName?`<span>Yerine alınan acil iş: ${h(e.task.replacementTaskName)}</span>`:''}</li>`)):'<p>Takip edilen kapsamda backlog’a döndürülen iş yok.</p>'}
 `}</section>`;
}
export function scopeReportHtml(sprints:Sprint[]):string{
 return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Acil işler ve kapsam değişimi</title><style>body{margin:0;background:#f3f6fa;font:14px/1.6 'Segoe UI',Arial,sans-serif;color:#17324f}main{max-width:1100px;margin:auto;padding:24px}h1{font-size:28px}header p{color:#61758e;font-size:12px}@media(max-width:650px){main{padding:12px}}@media print{body{background:white}main{padding:0}}${scopeCss}</style></head><body><main><header><h1>Acil işler ve kapsam değişimi</h1><p>${sprints.length} sprint · ${h(new Date().toISOString())} · Planlanan efor. Kapsam gerekçeleri içerir; paylaşmadan önce kontrol edin.</p></header>${sprints.map(scopeSectionHtml).join('')}</main></body></html>`;
}
