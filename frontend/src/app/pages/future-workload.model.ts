export interface ForecastRole {role:string;hours:number}
export interface ForecastPeriod {id:string;sprintId:string;label:string;start:string;end:string;scenario:boolean;nominalHours:number;offHours:number;leaveHours:number;overtimeHours:number;bauHours:number;bauOverHours:number;capacityHours:number;roles:ForecastRole[];bauSource:string}
export interface ForecastWork {id:string;title:string;category:string;roadmapId:string;roadmapTitle:string;source:'POOL'|'PLANNED';sprintId:string;sprintName:string;estimatedHours:number;coreHours:number;supportHours:number;reserveHours:number;unestimated:boolean;basis:string;roles:ForecastRole[]}
export interface FutureWorkload {generatedAt:string;today:string;from:string;weeks:number;bauDays:number;periods:ForecastPeriod[];items:ForecastWork[];warnings:string[]}
export const FORECAST_ROLES:Record<string,string>={DEV:'Development',DESIGN:'Design',TEST:'Test',ANALYZE:'Analiz',OTHER:'Diğer roller'};
const sum=<T>(rows:T[],value:(r:T)=>number)=>rows.reduce((s,r)=>s+value(r),0);
const rounded=(value:number)=>Math.round(value*100)/100;

/** Pool hours can only use free capacity in their required discipline. Fixed plans never move. */
export function futureWorkloadView(report:FutureWorkload){
 const pool=new Map<string,number>();
 for(const item of report.items.filter(i=>i.source==='POOL'))for(const r of item.roles)pool.set(r.role,(pool.get(r.role)||0)+r.hours);
 const periods=report.periods.map(period=>{
  const fixed=report.items.filter(i=>i.source==='PLANNED'&&i.sprintId===period.sprintId&&!!period.sprintId);
  const demand=new Map<string,number>();for(const item of fixed)for(const r of item.roles)demand.set(r.role,(demand.get(r.role)||0)+r.hours);
  const capacities=new Map(period.roles.map(r=>[r.role,r.hours]));
  const roles=[...new Set([...capacities.keys(),...demand.keys(),...pool.keys()])].map(role=>{
   const capacity=capacities.get(role)||0,planned=demand.get(role)||0;
   const fromPool=Math.min(pool.get(role)||0,Math.max(0,capacity-planned));pool.set(role,Math.max(0,(pool.get(role)||0)-fromPool));
   return {role,capacity,planned,fromPool,over:Math.max(0,planned-capacity),free:Math.max(0,capacity-planned-fromPool)};
  });
  const planned=rounded(sum(roles,r=>r.planned)),fromPool=rounded(sum(roles,r=>r.fromPool));
  return {...period,planned,fromPool,roles,over:rounded(sum(roles,r=>r.over)),free:rounded(sum(roles,r=>r.free)),
   plannedRate:period.capacityHours>0?100*planned/period.capacityHours:null,
   scenarioRate:period.capacityHours>0?100*(planned+fromPool)/period.capacityHours:null};
 });
 const roles=[...new Set([...Object.keys(FORECAST_ROLES),...report.items.flatMap(i=>i.roles.map(r=>r.role))])].map(role=>({
  role,label:FORECAST_ROLES[role]||role,
  demand:rounded(sum(report.items,i=>sum(i.roles.filter(r=>r.role===role),r=>r.hours))),
  capacity:rounded(sum(report.periods,p=>sum(p.roles.filter(r=>r.role===role),r=>r.hours))),
  poolRemaining:rounded(pool.get(role)||0)
 }));
 const categories=[...new Set(report.items.map(i=>i.category||'OTHER'))].map(category=>{
  const rows=report.items.filter(i=>(i.category||'OTHER')===category);
  return {category,count:rows.length,unknown:rows.filter(i=>i.unestimated).length,
   planned:rounded(sum(rows.filter(i=>i.source==='PLANNED'),i=>i.coreHours)),pool:rounded(sum(rows.filter(i=>i.source==='POOL'),i=>i.coreHours)),
   support:rounded(sum(rows,i=>i.supportHours)),reserve:rounded(sum(rows,i=>i.reserveHours)),total:rounded(sum(rows,i=>i.estimatedHours))};
 });
 const periodIds=new Set(report.periods.map(p=>p.sprintId).filter(Boolean));
 const outside=report.items.filter(i=>i.source==='PLANNED'&&!periodIds.has(i.sprintId));
 const core=rounded(sum(report.items,i=>i.coreHours)),capacity=rounded(sum(report.periods,p=>p.capacityHours));
 const outsideHours=rounded(sum(outside,i=>i.coreHours)),over=rounded(sum(periods,p=>p.over)),poolRemaining=rounded([...pool.values()].reduce((a,b)=>a+b,0));
 return {periods,roles,categories,core,capacity,unknown:report.items.filter(i=>i.unestimated).length,
  total:rounded(sum(report.items,i=>i.estimatedHours)),support:rounded(sum(report.items,i=>i.supportHours)),reserve:rounded(sum(report.items,i=>i.reserveHours)),
  planned:rounded(sum(report.items.filter(i=>i.source==='PLANNED'),i=>i.coreHours)),pool:rounded(sum(report.items.filter(i=>i.source==='POOL'),i=>i.coreHours)),
  outsideCount:outside.length,outsideHours,over,poolRemaining,remaining:rounded(outsideHours+over+poolRemaining),
  load:capacity>0?100*core/capacity:null};
}

export function forecastPeriodLabel(period:Pick<ForecastPeriod,'scenario'|'label'>,index:number){return period.scenario?'Dönem '+(index+1):period.label;}

/** A plain-language reading shared by the screen and its offline export. */
export function futureWorkloadReading(report:FutureWorkload){
 const view=futureWorkloadView(report),n=(value:number)=>new Intl.NumberFormat('tr-TR',{maximumFractionDigits:1}).format(value);
 let headline='',detail='',tone:'neutral'|'good'|'attention'='neutral';
 if(!view.core){
  headline=view.unknown?'İş yükü için saat tahminleri eksik.':report.items.length?'Çekirdek ekibe ek iş yükü yok.':'Bekleyen teslimat işi yok.';
  detail=view.unknown?'Saat tahmini girildiğinde doluluk hesaplanabilir.':report.items.length?'Bilinen saatler dış Support veya BAU rezervi kapsamında karşılanıyor.':'Havuzda ve planlanan sprintlerde bu hesaba giren açık iş bulunmuyor.';
 }else if(!view.capacity){
  headline='Bu dönemde kullanılabilir kapasite yok.';detail=n(view.core)+' saatlik iş yükü var. Tarihleri ve kapasite kesintilerini kontrol edin.';tone='attention';
 }else if(view.poolRemaining||view.over){
  headline=view.poolRemaining?'Havuzdaki işlerin tamamına yer yok.':'Bazı sprintlerde kapasite aşımı var.';
  detail=[view.poolRemaining?n(view.poolRemaining)+' sa havuz işi uygun uzmanlıkta boş kapasite bulamıyor.':'',view.over?n(view.over)+' sa sprint planı ilgili uzmanlığın kapasitesini aşıyor.':''].filter(Boolean).join(' ');tone='attention';
 }else if(view.outsideHours){
  headline='Planın bir kısmı seçilen tarihlerden sonra.';detail=n(view.outsideHours)+' sa planı değerlendirmek için daha uzun bir dönem seçin.';
 }else{
  headline='Bilinen iş yükü bu dönemin kapasitesine sığıyor.';detail='Toplam '+n(view.core)+' sa iş için '+n(view.capacity)+' sa kullanılabilir kapasite var.';tone='good';
 }
 return {...view,headline,detail,tone};
}
