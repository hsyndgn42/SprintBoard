import {effectiveTaskStatus} from '../task-lifecycle';
import {taskCategoryLabel} from '../task-taxonomy';
import type {Sprint,Task} from '../api.service';
import {buildScope,scopeEffort} from './scope-summary.model';
import {isLeave} from './review.model';

/**
 * The read model behind "Acil İşler ve Kapsam Değişimi".
 *
 * The report has one job: say how far the plan moved after the sprint opened, and be honest
 * about the sprints where that question cannot be answered at all. Sprints without flow history
 * are not zero-change sprints, they are unmeasured ones, so they are counted separately and kept
 * out of every total rather than quietly averaged in.
 *
 * Business rules are not recomputed here. buildScope() owns them; this file only groups,
 * classifies and shapes the result so the screen and the standalone export can share one source.
 */

/** FULL: baseline captured when the sprint opened. PARTIAL: tracking began mid-sprint. UNAVAILABLE: no history. */
export type TrackingState='FULL'|'PARTIAL'|'UNAVAILABLE';

export const SCOPE_COLORS={
 baseline:'#2f6a9e', current:'#1b3f63', added:'#c8811f', removed:'#c0362c',
 reconciliation:'#6b5ca5', unavailable:'#b9c4cb', partial:'#7fa8cb',
 done:'#2e7d61', doing:'#2f6a9e', todo:'#c8811f', undone:'#c0362c', dropped:'#8a98a4',
} as const;

const TR_NUMBER=new Intl.NumberFormat('tr-TR',{maximumFractionDigits:1});
const TR_DAY=new Intl.DateTimeFormat('tr-TR',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Istanbul'});
const TR_TIME=new Intl.DateTimeFormat('tr-TR',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Istanbul'});
const TR_SHORT=new Intl.DateTimeFormat('tr-TR',{dateStyle:'medium',timeZone:'Europe/Istanbul'});

export const num=(value:number)=>TR_NUMBER.format(roundHalf(value));
export const hours=(value:number)=>num(value)+' sa';
export const items=(count:number)=>count+' iş';
/** A reader sees "6 Kasım 2026, 22:07"; the ISO form belongs in metadata, not in a heading. */
export const stamp=(at:Date)=>TR_DAY.format(at)+', '+TR_TIME.format(at);
export const shortDate=(value:string)=>{const at=new Date(value);return Number.isNaN(at.getTime())?'—':TR_SHORT.format(at);};
/** One rounding rule everywhere, so a chart, a table and a total can never disagree by a rounding step. */
function roundHalf(value:number){return Math.round((value+Number.EPSILON)*10)/10;}

const STATUS_LABELS:Record<string,string>={done:'Done',undone:'Undone',doing:'Devam ediyor',todo:'Yapılacak',removed:'Kapsamdan çıkarıldı',unknown:'Bilinmiyor'};
const STATUS_FILL:Record<string,string>={done:SCOPE_COLORS.done,doing:SCOPE_COLORS.doing,todo:SCOPE_COLORS.todo,undone:SCOPE_COLORS.undone,removed:SCOPE_COLORS.dropped,unknown:SCOPE_COLORS.dropped};
const URGENT_ORDER=['done','doing','todo','undone','removed','unknown'];
export const statusLabel=(key:string)=>STATUS_LABELS[key]||key;
export const sprintStatusLabel=(status:string)=>({active:'Aktif',planned:'Planlanan',completed:'Kapanmış'}[status]||status);
export const trackingLabel=(state:TrackingState)=>({FULL:'Tam takip',PARTIAL:'Kısmi tarihçe',UNAVAILABLE:'Tarihçe yok'}[state]);

export interface UrgentRow{id:string;externalId:string;name:string;status:string;statusText:string;hours:number;at:string;category:string;reason:string}
export interface ReturnedRow{id:string;externalId:string;name:string;hours:number;at:string;previousStatus:string;reason:string;replacement:string}
export interface StatusShare{key:string;label:string;count:number;fill:string}

export interface SprintScope{
 id:string;name:string;number:number;status:string;start:string;end:string;
 tracking:TrackingState;trackedAt:string|null;
 baselineItems:number;baselineHours:number;
 addedItems:number;addedHours:number;removedItems:number;removedHours:number;
 currentItems:number;currentHours:number;reconciliationHours:number;
 urgentCount:number;urgentHours:number;urgentDone:number;urgentCompletion:number|null;
 statusShares:StatusShare[];urgent:UrgentRow[];returned:ReturnedRow[];reserveMoves:number;
}

export interface ScopeReport{
 generatedAt:Date;generatedAtIso:string;sprintRange:string;effortBasis:string;
 totalSprints:number;fullCount:number;partialCount:number;unavailableCount:number;
 tracked:SprintScope[];unavailableNames:string[];
 addedItems:number;addedHours:number;removedItems:number;removedHours:number;
 urgentCount:number;urgentHours:number;urgentDone:number;urgentCompletion:number|null;
 statusShares:StatusShare[];findings:string[];
}

/** The tracking state is read from the recorded origin; it is never guessed from the numbers. */
export function trackingOf(sprint:Sprint):TrackingState{
 const origin=sprint.flow?.origin;
 return origin==='START'?'FULL':origin==='OBSERVED'?'PARTIAL':'UNAVAILABLE';
}

function urgentRows(measured:ReturnType<typeof buildScope>):UrgentRow[]{
 return measured.emergencies.map(entry=>({
  id:entry.task.id,externalId:entry.task.externalId||'',name:entry.task.name,
  status:entry.result,statusText:statusLabel(entry.result),hours:entry.hours,at:entry.at,
  category:taskCategoryLabel(entry.task.taskCategory),reason:entry.reason,
 }));
}

function returnedRows(measured:ReturnType<typeof buildScope>):ReturnedRow[]{
 return measured.removed.map(entry=>({
  id:entry.task.id,externalId:entry.task.externalId||'',name:entry.task.name,
  hours:isLeave(entry.task)?0:scopeEffort(entry.task),at:entry.at,
  previousStatus:statusLabel(effectiveTaskStatus(entry.task)),reason:entry.reason,
  replacement:entry.task.replacementTaskName||'',
 }));
}

function shares(rows:{status:string}[]):StatusShare[]{
 return URGENT_ORDER.map(key=>({key,label:statusLabel(key),count:rows.filter(r=>r.status===key).length,fill:STATUS_FILL[key]}))
  .filter(share=>share.count>0);
}

export function summariseSprint(sprint:Sprint):SprintScope{
 const measured=buildScope(sprint),tracking=trackingOf(sprint);
 const urgent=urgentRows(measured),returned=returnedRows(measured);
 const urgentDone=urgent.filter(row=>row.status==='done').length;
 const reconciliation=roundHalf(measured.currentHours-(measured.baselineHours+measured.addedHours-measured.removedHours));
 return {
  id:sprint.id,name:sprint.name,number:sprint.number,status:sprint.status,start:sprint.start,end:sprint.end,
  tracking,trackedAt:sprint.flow?.trackedAt||null,
  baselineItems:measured.baseline.length,baselineHours:roundHalf(measured.baselineHours),
  addedItems:measured.added.length,addedHours:roundHalf(measured.addedHours),
  removedItems:measured.removed.length,removedHours:roundHalf(measured.removedHours),
  currentItems:measured.currentCount,currentHours:roundHalf(measured.currentHours),
  // Reserve redistribution and assignment edits move hours without a scope event, so the identity can drift.
  reconciliationHours:Math.abs(reconciliation)<0.05?0:reconciliation,
  urgentCount:urgent.length,urgentHours:roundHalf(measured.emergencyHours),urgentDone,
  urgentCompletion:urgent.length?Math.round(urgentDone*100/urgent.length):null,
  statusShares:shares(urgent),urgent,returned,reserveMoves:measured.reserveEvents.length,
 };
}

function range(sprints:Sprint[]):string{
 if(!sprints.length)return 'Sprint seçilmedi';
 const names=sprints.map(s=>s.name);
 return names.length===1?names[0]:names[names.length-1]+' – '+names[0];
}

/** Only things the stored data states outright. No causes, no judgements, no advice. */
function findingsOf(report:Omit<ScopeReport,'findings'>):string[]{
 const out:string[]=[];
 for(const sprint of report.tracked){
  if(sprint.addedItems>0)out.push(sprint.name+' kapsamına sonradan '+items(sprint.addedItems)+' ve '+hours(sprint.addedHours)+' eklendi.');
  if(sprint.removedItems>0)out.push(sprint.name+' kapsamından '+items(sprint.removedItems)+' ve '+hours(sprint.removedHours)+' backlog’a döndü.');
  const open=sprint.urgent.filter(row=>row.status==='todo').length;
  if(open>0)out.push(sprint.name+' içinde '+open+' acil iş hâlâ yapılacak durumda.');
  if(sprint.reconciliationHours!==0)out.push(sprint.name+' için başlangıç, eklenen ve çıkarılan saatler güncel planla '+hours(Math.abs(sprint.reconciliationHours))+' fark veriyor.');
 }
 if(report.urgentCount>0)out.push('Takipli sprintlerdeki '+report.urgentCount+' acil işin '+report.urgentDone+' tanesi tamamlandı.');
 if(report.unavailableCount>0)out.push(report.unavailableCount+' sprint için tarihsel kapsam karşılaştırması yapılamıyor.');
 return out;
}

export function buildScopeReport(sprints:Sprint[],generatedAt=new Date()):ScopeReport{
 // Newest first everywhere: the sprint a reader cares about is the one that just happened.
 const ordered=[...sprints].sort((a,b)=>b.number-a.number);
 const tracked=ordered.filter(s=>trackingOf(s)!=='UNAVAILABLE').map(summariseSprint);
 const unavailable=ordered.filter(s=>trackingOf(s)==='UNAVAILABLE');
 const urgent=tracked.flatMap(s=>s.urgent);
 const urgentDone=urgent.filter(row=>row.status==='done').length;
 const base={
  generatedAt,generatedAtIso:generatedAt.toISOString(),sprintRange:range(ordered),effortBasis:'Planlanan efor',
  totalSprints:ordered.length,
  fullCount:tracked.filter(s=>s.tracking==='FULL').length,
  partialCount:tracked.filter(s=>s.tracking==='PARTIAL').length,
  unavailableCount:unavailable.length,
  tracked,unavailableNames:unavailable.map(s=>s.name),
  addedItems:tracked.reduce((n,s)=>n+s.addedItems,0),addedHours:roundHalf(tracked.reduce((n,s)=>n+s.addedHours,0)),
  removedItems:tracked.reduce((n,s)=>n+s.removedItems,0),removedHours:roundHalf(tracked.reduce((n,s)=>n+s.removedHours,0)),
  urgentCount:urgent.length,urgentHours:roundHalf(tracked.reduce((n,s)=>n+s.urgentHours,0)),urgentDone,
  urgentCompletion:urgent.length?Math.round(urgentDone*100/urgent.length):null,
  statusShares:shares(urgent),
 };
 return {...base,findings:findingsOf(base)};
}

/** One sentence a reader can quote, built only from the measured sprints. */
export function coverageSentence(report:ScopeReport):string{
 if(!report.totalSprints)return 'Raporlanacak sprint yok.';
 const measured=report.fullCount+report.partialCount;
 if(!measured)return report.totalSprints+' sprintin hiçbirinde kapsam değişimi takibi bulunmuyor; bu sprintler sıfır değişim olarak değerlendirilmemiştir.';
 return report.totalSprints+' sprint incelendi; '+measured+' sprintte kapsam değişimi takibi mevcut, '
  +report.unavailableCount+' sprintte tarihsel kapsam verisi bulunmuyor.';
}

export const UNAVAILABLE_NOTE='Tarihsel kapsam verisi bulunmayan sprintler sıfır kapsam değişimi olarak değerlendirilmemiştir.';
export const TOTALS_NOTE='Toplamlar yalnız kapsam değişimi takibi bulunan sprintleri kapsar.';
export const EFFORT_NOTE='Planlanan efor gösterilir; gerçekleşen süre değildir.';
export const RECONCILIATION_NOTE='Rezerv veya atama hareketlerinden kaynaklanabilecek mutabakat farkı.';

export function unavailableSentence(report:ScopeReport):string{
 if(!report.unavailableCount)return '';
 const names=report.unavailableNames;
 const span=names.length===1?names[0]:names[names.length-1]+'–'+names[0];
 return span+' için kapsam değişimi takibi bulunmamaktadır. Bu sprintler sıfır kapsam değişimi olarak değerlendirilmemiş ve dönem toplamlarına dahil edilmemiştir.';
}

/** Every calculation the report performs, written once so no sprint section has to repeat it. */
export const METHODOLOGY:{term:string;text:string}[]=[
 {term:'Planlanan efor',text:'Tüm saatler planlanan eforu gösterir; harcanan süre veya bireysel performans ölçüsü değildir.'},
 {term:'Atama ve tahmin',text:'İşte atama varsa kişi saatleri toplanır, atama yoksa işin kendi tahmini kullanılır.'},
 {term:'X destek',text:'Yalnız destek olarak işaretlenen atamalar 0 saat sayılır.'},
 {term:'BAU',text:'BAU işleri kapsama dahildir ve otomatik Done kabul edilir.'},
 {term:'Leave',text:'Leave kayıtları saat toplamlarına dahil edilmez.'},
 {term:'Defect Support rezervi',text:'Rezerv içinde kalan defectler kapsam artışı veya azalışı sayılmaz; yalnız rezervi aşan ek plan saatleri kapsama yazılır. Kişi rezervi sprint giriş sırasıyla paylaşılır.'},
 {term:'Rezerv hareketleri',text:'Rezerv içi hareketler geçmişte korunur ancak kapsam değişimi toplamlarına girmez.'},
 {term:'Tam takip',text:'Başlangıç kapsamı sprint açılışında kaydedilmiştir; açılıştan bugüne tüm hareketler bilinir.'},
 {term:'Kısmi tarihçe',text:'Takip sprint devam ederken başlamıştır; takip öncesi hareketler bilinmez ve başlangıç yerine takip başlangıcı kullanılır.'},
 {term:'Tarihçe yok',text:'Sprint için kapsam kaydı bulunmaz. Sıfır kapsam değişimi olarak yorumlanamaz ve dönem toplamlarına dahil edilmez.'},
 {term:'Mutabakat farkı',text:'Güncel plan − (başlangıç + eklenen − çıkarılan). Rezerv dağıtımı ve atama değişiklikleri saatleri kapsam kaydı oluşturmadan değiştirebildiği için bu fark sıfırdan farklı olabilir.'},
 {term:'Dönem toplamları',text:'Toplamlar yalnız tam veya kısmi takibi olan sprintlerden hesaplanır.'},
];

/* --------------------------------------------------------------------- figures */

/**
 * A chart mark. One flat shape rather than a union, because the same list is walked by an
 * Angular template and by a string renderer, and both stay trivial when no narrowing is needed.
 */
export interface Mark{
 kind:'rect'|'path'|'line'|'text';
 x?:number;y?:number;w?:number;h?:number;rx?:number;fill?:string;
 d?:string;x1?:number;y1?:number;x2?:number;y2?:number;
 text?:string;role?:'axis'|'zero'|'link'|'label'|'value'|'unit'|'inverse';anchor?:'start'|'middle'|'end';
}

/** A chart is geometry plus words. The screen and the export render the same marks. */
export interface Figure{id:string;width:number;height:number;title:string;desc:string;marks:Mark[];empty?:string}

const rect=(x:number,y:number,w:number,h:number,fill:string,rx=1):Mark=>({kind:'rect',x,y,w:Math.max(0,w),h:Math.max(0,h),fill,rx});
const text=(x:number,y:number,value:string,role:'label'|'value'|'unit'|'inverse'='label',anchor:'start'|'middle'|'end'='start'):Mark=>({kind:'text',x,y,text:value,role,anchor});
const line=(x1:number,y1:number,x2:number,y2:number,role:'axis'|'zero'|'link'='axis'):Mark=>({kind:'line',x1,y1,x2,y2,role});
const clip=(value:string,max=26)=>value.length>max?value.slice(0,max-1)+'…':value;

/** 8.1 Coverage: how much of the period can be measured at all. */
export function coverageFigure(report:ScopeReport):Figure{
 const W=720,total=Math.max(1,report.totalSprints);
 const bands=[
  {label:'Tam takip',count:report.fullCount,fill:SCOPE_COLORS.baseline},
  {label:'Kısmi tarihçe',count:report.partialCount,fill:SCOPE_COLORS.partial},
  {label:'Tarihçe yok',count:report.unavailableCount,fill:SCOPE_COLORS.unavailable},
 ].filter(band=>band.count>0);
 const marks:Mark[]=[];let x=0,y=70;
 for(const band of bands){
  const w=W*band.count/total,pct=Math.round(band.count*100/total);
  marks.push(rect(x,20,w,34,band.fill,2));
  if(w>74)marks.push(text(x+w/2,42,band.count+' sprint · %'+pct,'inverse','middle'));
  // Band names are stacked on their own lines: narrow bands would otherwise collide under the bar.
  marks.push(rect(0,y-9,10,10,band.fill,2));
  marks.push(text(16,y,band.label+' · '+band.count+' sprint (%'+pct+')','label','start'));
  x+=w;y+=16;
 }
 marks.push(text(0,12,'Dönem kapsamı · '+report.totalSprints+' sprint','unit','start'));
 return {id:'kapsam-veri',width:W,height:62+bands.length*16,title:'Veri kapsamı',
  desc:coverageSentence(report)+' '+UNAVAILABLE_NOTE,marks,
  empty:report.totalSprints?undefined:'Raporlanacak sprint yok.'};
}

/** 8.2 Urgent work: a ring only when there is something to divide. */
export function urgentFigure(report:ScopeReport):Figure{
 const shares=report.statusShares,total=shares.reduce((n,s)=>n+s.count,0);
 if(!total)return {id:'acil-durum',width:240,height:240,title:'Acil iş durumu',
  desc:'Takipli sprintlerde acil veya plansız olarak işaretlenmiş iş yok.',marks:[],
  empty:'Takipli sprintlerde acil iş kaydı yok.'};
 const marks:Mark[]=[];let angle=-Math.PI/2;
 const point=(a:number,r:number)=>[(120+r*Math.cos(a)).toFixed(2),(120+r*Math.sin(a)).toFixed(2)];
 for(const share of shares){
  const span=2*Math.PI*share.count/total,start=angle,end=angle+span;angle=end;
  const [ax,ay]=point(start,100),[bx,by]=point(end,100),[cx,cy]=point(end,60),[dx,dy]=point(start,60);
  const large=span>Math.PI?1:0;
  const d=shares.length===1
   ?'M120 20 A100 100 0 1 1 119.9 20 Z M120 60 A60 60 0 1 0 119.9 60 Z'
   :`M${ax} ${ay} A100 100 0 ${large} 1 ${bx} ${by} L${cx} ${cy} A60 60 0 ${large} 0 ${dx} ${dy} Z`;
  marks.push({kind:'path',d,fill:share.fill});
 }
 marks.push(text(120,116,'%'+(report.urgentCompletion??0),'value','middle'));
 marks.push(text(120,138,report.urgentDone+' / '+total+' tamamlandı','unit','middle'));
 return {id:'acil-durum',width:240,height:240,title:'Acil iş durumu',
  desc:'Takipli sprintlerdeki '+total+' acil işin '+report.urgentDone+' tanesi tamamlandı. Dağılım: '
   +shares.map(s=>s.label+' '+s.count).join(', ')+'.',marks};
}

/** 8.3 Which sprint moved, and in which direction. Added right, returned left. */
export function movementFigure(report:ScopeReport):Figure{
 const rows=report.tracked;
 if(!rows.length)return {id:'kapsam-hareketi',width:720,height:60,title:'Sprint kapsam hareketi',
  desc:'Kapsam değişimi takibi bulunan sprint yok.',marks:[],empty:'Takipli sprint yok.'};
 const W=720,zero=400,arm=290,rowH=34,top=34;
 const peak=Math.max(1,...rows.flatMap(r=>[r.addedHours,r.removedHours]));
 const marks:Mark[]=[
  text(0,14,'Backlog’a dönen (sa)','unit','start'),
  text(W,14,'Sonradan eklenen (sa)','unit','end'),
 ];
 rows.forEach((row,i)=>{
  const y=top+i*rowH;
  marks.push(text(0,y+14,clip(row.name+(row.tracking==='PARTIAL'?' · kısmi':'')),'label','start'));
  if(row.removedHours>0){
   const w=arm*row.removedHours/peak;
   marks.push(rect(zero-w,y+3,w,16,SCOPE_COLORS.removed));
   marks.push(text(zero-w-6,y+15,'−'+num(row.removedHours),'value','end'));
  }
  if(row.addedHours>0){
   const w=arm*row.addedHours/peak;
   marks.push(rect(zero,y+3,w,16,SCOPE_COLORS.added));
   marks.push(text(zero+w+6,y+15,'+'+num(row.addedHours),'value','start'));
  }
  if(!row.addedHours&&!row.removedHours)marks.push(text(zero+6,y+15,'kapsam hareketi yok','unit','start'));
 });
 marks.push(line(zero,top-6,zero,top+rows.length*rowH,'zero'));
 return {id:'kapsam-hareketi',width:W,height:top+rows.length*rowH+10,title:'Sprint kapsam hareketi',
  desc:rows.map(r=>r.name+': '+hours(r.addedHours)+' eklendi, '+hours(r.removedHours)+' çıkarıldı').join('. ')+'.',marks};
}

/** 8.4 Scope reconciliation for one sprint: where the plan started, what moved it, where it stands. */
export function waterfallFigure(sprint:SprintScope):Figure{
 const baselineLabel=sprint.tracking==='PARTIAL'?'Takip başlangıcı':'Başlangıç planı';
 const steps=[
  {label:baselineLabel,delta:sprint.baselineHours,fill:SCOPE_COLORS.baseline,total:true,sign:''},
  {label:'Eklenen',delta:sprint.addedHours,fill:SCOPE_COLORS.added,total:false,sign:'+'},
  {label:'Çıkarılan',delta:-sprint.removedHours,fill:SCOPE_COLORS.removed,total:false,sign:'−'},
  {label:'Mutabakat farkı',delta:sprint.reconciliationHours,fill:SCOPE_COLORS.reconciliation,total:false,sign:sprint.reconciliationHours<0?'−':'+'},
  {label:'Güncel plan',delta:sprint.currentHours,fill:SCOPE_COLORS.current,total:true,sign:''},
 ].filter(step=>step.total||step.delta!==0);
 const W=720,base=176,plot=140,left=24;
 const slot=(W-left*2)/Math.max(1,steps.length);
 const bar=Math.min(84,slot-26);
 let running=0;const spans=steps.map(step=>{
  const from=step.total?0:running,to=step.total?step.delta:running+step.delta;
  if(!step.total)running=to;else running=step.delta;
  return {step,from,to};
 });
 const peak=Math.max(1,...spans.flatMap(s=>[Math.abs(s.from),Math.abs(s.to)]));
 const y=(value:number)=>base-plot*value/peak;
 const marks:Mark[]=[line(left-8,base,W-left+8,base,'zero')];
 spans.forEach((span,i)=>{
  const cx=left+(i+0.5)*slot,high=Math.max(span.from,span.to),low=Math.min(span.from,span.to);
  if(i>0)marks.push(line(left+(i-0.5)*slot+bar/2,y(span.from),cx-bar/2,y(span.from),'link'));
  marks.push(rect(cx-bar/2,y(high),bar,Math.max(2,y(low)-y(high)),span.step.fill));
  const value=span.step.total?num(span.step.delta):span.step.sign+num(Math.abs(span.step.delta));
  marks.push(text(cx,y(high)-8,value,'value','middle'));
  marks.push(text(cx,base+18,clip(span.step.label,18),'label','middle'));
 });
 marks.push(text(left-8,14,'saat','unit','start'));
 return {id:'mutabakat-'+sprint.id,width:W,height:206,title:sprint.name+' kapsam mutabakatı',
  desc:[baselineLabel+' '+hours(sprint.baselineHours),'eklenen '+hours(sprint.addedHours),
   'çıkarılan '+hours(sprint.removedHours),'mutabakat farkı '+hours(sprint.reconciliationHours),
   'güncel plan '+hours(sprint.currentHours)].join(', ')+'.',marks};
}
