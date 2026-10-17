import type {SprintSummary,OvertimeRecord,OvertimeEntry,LeaveRecord} from '../api.service';
import {overtimePeople} from './overtime-summary.model';
export interface OvertimeTrendRow {id:string;number:number;name:string;status:string;earned:number;planned:number;usedDays:number;unmatchedUsedHours:number;matched?:number;remaining?:number;excess?:number;unplanned?:number;unclassified?:number}
export interface DefectTrendBucket {sprintId:string;subtype:string;severity:string;environment:string;status:string;count:number}
export interface DefectTrendRow {id:string;number:number;name:string;status:string;test:number;prod:number;other:number;done:number;undone:number;open:number}
export const round=(n:number)=>Math.round(n*100)/100;
export function overtimeTrend(sprints:SprintSummary[],records:OvertimeRecord[],entries:OvertimeEntry[],leaves:LeaveRecord[],memberId=''):OvertimeTrendRow[]{
 const people=overtimePeople([],records,entries,leaves,sprints).filter(p=>!memberId||p.memberId===memberId);
 return [...sprints].sort((a,b)=>a.number-b.number).map(s=>{
  const rows=people.flatMap(p=>p.rows.filter(r=>r.key===s.id));
  const scoped=entries.filter(e=>e.sprintId===s.id&&(!memberId||e.memberId===memberId));
  const earned=round(rows.reduce((n,r)=>n+r.earnedHours,0));
  const reconciliation=overtimeReconciliation(scoped,earned);
  return {id:s.id,number:s.number,name:s.name,status:s.status,...reconciliation,earned,planned:round(entries.filter(e=>e.sprintId===s.id&&(!memberId||e.memberId===memberId)).reduce((n,e)=>n+e.plannedHours,0)),usedDays:round(rows.reduce((n,r)=>n+r.usedDays,0)),unmatchedUsedHours:round(rows.reduce((n,r)=>n+r.unmatchedUsedHours,0))};
 });
}
export function overtimeReconciliation(entries:OvertimeEntry[],earned:number){
 const plans=entries.filter(e=>e.plannedHours>0||(e.planActualHours||0)>0);
 const actual=(p:OvertimeEntry)=>p.planActualHours??entries.filter(e=>e.planId===p.id).reduce((n,e)=>n+e.earnedHours,0);
 const matched=round(plans.reduce((n,p)=>n+Math.min(p.plannedHours,actual(p)),0));
 const remaining=round(plans.reduce((n,p)=>n+Math.max(0,p.plannedHours-actual(p)),0));
 const excess=round(plans.reduce((n,p)=>n+Math.max(0,actual(p)-p.plannedHours),0));
 const unplanned=round(entries.filter(e=>e.planClassification==='UNPLANNED').reduce((n,e)=>n+e.earnedHours,0));
 return {matched,remaining,excess,unplanned,unclassified:round(Math.max(0,earned-matched-excess-unplanned))};
}
export const reconciliationSeries=(rows:OvertimeTrendRow[]):TrendSeries[]=>[
 {label:'Plan kapsamında gerçekleşen',color:'#0d9274',values:rows.map(r=>r.matched||0)},
 {label:'Kalan plan',color:'#94a3b8',values:rows.map(r=>r.remaining||0)},
 {label:'Plan aşımı',color:'#d34b45',values:rows.map(r=>r.excess||0)},
 {label:'Plansız mesai',color:'#8555bf',values:rows.map(r=>r.unplanned||0)}];
export function reconciliationHtml(rows:OvertimeTrendRow[]){
 const total=(key:'matched'|'remaining'|'excess'|'unplanned'|'unclassified')=>round(rows.reduce((n,r)=>n+(r[key]||0),0));
 return '<section class="section"><h3>Plan ve gerçekleşen eşleştirmesi</h3><p>'+total('matched')+' sa plan kapsamında · '+total('remaining')+' sa kalan · '+total('excess')+' sa aşan · '+total('unplanned')+' sa plansız · '+total('unclassified')+' sa sınıflandırılmamış geçmiş kayıt</p>'+trendSvg(rows.map(r=>'S'+r.number),reconciliationSeries(rows),'saat')+'<p>Kalan ve aşan saatler her plan için ayrı hesaplanır. Gerçekleşen = plan kapsamında + aşan + plansız + sınıflandırılmamış. Kalan plan hakediş değildir. Kapasite ve görev eforuna tekrar eklenmez.</p></section>';
}
export function defectTrend(sprints:SprintSummary[],buckets:DefectTrendBucket[],scope:string,subtype='',severity='',environment=''):DefectTrendRow[]{
 if(scope==='pool')return [];
 return [...sprints].filter(s=>scope==='all'||scope==='sprints'||s.id===scope).sort((a,b)=>a.number-b.number).map(s=>{
  const rows=buckets.filter(r=>r.sprintId===s.id&&(!subtype||r.subtype===subtype)&&(!severity||r.severity===severity)&&(!environment||r.environment===environment));
  const sum=(fn:(r:DefectTrendBucket)=>boolean)=>rows.filter(fn).reduce((n,r)=>n+r.count,0);
  return {id:s.id,number:s.number,name:s.name,status:s.status,test:sum(r=>r.subtype==='TEST_DEFECT'),prod:sum(r=>r.subtype==='PROD_DEFECT'),other:sum(r=>!['TEST_DEFECT','PROD_DEFECT'].includes(r.subtype)),done:sum(r=>r.status==='done'),undone:sum(r=>r.status==='undone'),open:sum(r=>!['done','undone'].includes(r.status))};
 });
}
export interface TrendSeries {label:string;color:string;values:number[]}
const h=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const trendX=(i:number,count:number)=>count<=1?360:52+i*616/(count-1);
export const trendY=(v:number,max:number)=>190-Math.max(0,v)/Math.max(1,max)*160;
export const trendMax=(series:TrendSeries[])=>Math.max(1,...series.flatMap(s=>s.values));
export const trendPoints=(series:TrendSeries,count:number,max:number)=>series.values.map((v,i)=>trendX(i,count)+','+trendY(v,max)).join(' ');
export function trendSvg(labels:string[],series:TrendSeries[],unit:string){
 const max=trendMax(series);
 return '<svg viewBox="0 0 720 230" role="img" aria-label="'+h(unit)+' trendi" style="width:100%;display:block">'+[0,.5,1].map(f=>'<line x1="52" x2="668" y1="'+trendY(max*f,max)+'" y2="'+trendY(max*f,max)+'" stroke="#dce5ef"/><text x="42" y="'+(trendY(max*f,max)+4)+'" text-anchor="end" fill="#64748b" font-size="11">'+round(max*f)+'</text>').join('')+series.map(s=>'<polyline points="'+trendPoints(s,labels.length,max)+'" fill="none" stroke="'+h(s.color)+'" stroke-width="3"/>'+s.values.map((v,i)=>'<circle cx="'+trendX(i,labels.length)+'" cy="'+trendY(v,max)+'" r="4" fill="'+h(s.color)+'"><title>'+h(labels[i])+': '+h(s.label)+' '+round(v)+' '+h(unit)+'</title></circle>').join('')).join('')+labels.map((l,i)=>i%Math.max(1,Math.ceil(labels.length/10))===0||i===labels.length-1?'<text x="'+trendX(i,labels.length)+'" y="216" text-anchor="middle" font-size="11" fill="#64748b">'+h(l)+'</text>':'').join('')+'</svg><p style="font-size:12px">'+series.map(s=>'<span style="color:'+h(s.color)+';margin-right:16px">● '+h(s.label)+'</span>').join('')+'</p>';
}
export const overtimeSeries=(rows:OvertimeTrendRow[]):TrendSeries[]=>[{label:'Gerçekleşen mesai',color:'#2563eb',values:rows.map(r=>r.earned)},{label:'Planlanan mesai',color:'#c47718',values:rows.map(r=>r.planned)}];
export const usageSeries=(rows:OvertimeTrendRow[]):TrendSeries[]=>[{label:'Mesaiden kullanılan izin',color:'#0d9274',values:rows.map(r=>r.usedDays)}];
export const defectSeries=(rows:DefectTrendRow[]):TrendSeries[]=>[{label:'Test Defect',color:'#2563eb',values:rows.map(r=>r.test)},{label:'Prod Defect',color:'#d34b45',values:rows.map(r=>r.prod)},{label:'Done · tüm defectler',color:'#0d9274',values:rows.map(r=>r.done)}];
export function overtimeSectionHtml(rows:OvertimeTrendRow[],selectedId?:string){
 const scope=selectedId?rows.filter(r=>r.id===selectedId):rows;
 const sum=(key:'earned'|'planned'|'usedDays')=>round(scope.reduce((n,r)=>n+r[key],0));
 const history=selectedId?rows.filter(r=>r.number<=(scope[0]?.number??-1)).slice(-8):rows;
 return '<section class="section" style="margin:24px 0"><h2>Mesai durumu ve trendi</h2><p>'+h(selectedId?scope[0]?.name:'Tüm sprintler')+' · '+sum('earned')+' sa gerçekleşen · '+sum('planned')+' sa planlanan · '+sum('usedDays')+' gün mesaiden izin kullanımı</p>'+trendSvg(history.map(r=>'S'+r.number),overtimeSeries(history),'saat')+reconciliationHtml(scope)+'<h3>Mesaiden izin kullanımı</h3>'+trendSvg(history.map(r=>'S'+r.number),usageSeries(history),'gün')+'<p style="font-size:12px;color:#64748b">Gerçekleşen: tarihsel kayıtlar ve onaylanmış/doğrudan girilmiş mesailer. Bekleyen talepler dahil değildir. Plan kapasiteye tekrar eklenmez; kayıtlı plan yoksa 0 gösterilir. İzin günleri saat serisine eklenmez. Aktif sprint geçicidir; tarihsel mesai düzeltmeleri rapora yansır.</p></section>';
}
