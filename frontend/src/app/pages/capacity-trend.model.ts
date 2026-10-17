import type { MemberReportRow,ReportRow } from '../api.service';
export type TrendFilter={memberId:string;source:string;limit:number};
export type CapacityTrend={id:string;number:number;name:string;end:string;people:number;known:number;frozen:number;recalculated:number;unknown:number;capacity:number;planned:number;corePlanned:number;supportPlanned:number;supportPeople:number;unknownHours:number;over:number;free:number;ratio:number|null;coreRatio:number|null};
const hours=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)?Math.max(0,n):0;
const rounded=(n:number)=>Math.round(n*100)/100;
export function buildCapacityTrend(sprints:ReportRow[],members:MemberReportRow[],filter:TrendFilter):CapacityTrend[]{
 const ordered=[...sprints].sort((a,b)=>a.number-b.number||a.id.localeCompare(b.id));
 const chosen=filter.limit>0?ordered.slice(-filter.limit):ordered;
 return chosen.map(s=>{
  const rows=members.filter(r=>r.sprintId===s.id&&(!filter.memberId||r.memberId===filter.memberId)&&(!filter.source||r.capacitySource===filter.source));
  let capacity=0,planned=0,corePlanned=0,supportPlanned=0,supportPeople=0,unknownHours=0,over=0,free=0,known=0,frozen=0,recalculated=0;
  for(const r of rows){
   const p=hours(r.effortHours);planned+=p;
   if(r.capacitySource==='FROZEN')frozen++;else if(r.capacitySource==='RECALCULATED')recalculated++;
   // Historical report metadata comes from the frozen snapshot when available.
   // External support contributes assigned hours, never core-team capacity.
   if(r.engagement==='SUPPORT'||r.teamRole==='ARCHITECT'||r.capacitySource==='UNSPECIFIED_SUPPORT'){
    supportPeople++;supportPlanned+=p;continue;
   }
   corePlanned+=p;
   const valid=['FROZEN','RECALCULATED'].includes(r.capacitySource)&&typeof r.availableHours==='number'&&Number.isFinite(r.availableHours)&&r.availableHours>=0;
   if(!valid){unknownHours+=p;continue;}
   known++;
   const c=hours(r.availableHours);capacity+=c;over+=Math.max(0,p-c);free+=Math.max(0,c-p);
  }
  const unknown=rows.length-known-supportPeople;
  return {id:s.id,number:s.number,name:s.name,end:s.end,people:rows.length,known,frozen,recalculated,unknown,capacity:rounded(capacity),planned:rounded(planned),corePlanned:rounded(corePlanned),supportPlanned:rounded(supportPlanned),supportPeople,unknownHours:rounded(unknownHours),over:rounded(over),free:rounded(free),ratio:capacity>0&&unknown===0?rounded(planned/capacity*100):null,coreRatio:capacity>0&&unknown===0?rounded(corePlanned/capacity*100):null};
 });
}
export function trendSource(r:CapacityTrend):string{return !r.frozen&&!r.recalculated?'Karşılaştırılabilir kayıt yok':r.frozen&&r.recalculated?'Karma kaynak':r.frozen?'Sabit kapanış':'Yeniden hesaplanan';}
export function trendCsvRows(rows:CapacityTrend[],scope:string):unknown[][]{
 return [
 ['Kapasite / planlanan efor trendi',scope],
 ['Kapsam','Tamamlanan sprintler; kayıtlı kişiler. Kapasite yalnız çekirdek ekip; plan çekirdek + Support atamalarıdır. Gerçekleşen efor veya performans değildir. BAU dahil, Leave ve X saat hariç. Eksik çekirdek kapasitede oran hesaplanmaz. %100 üstü planlamaya izin verilir; Support katkısı veya fazla mesai kararı olabilir.'],
 ['Sprint','Bitiş','Kaynak','Kapasitesi bilinen çekirdek kişi','Kapasitesi bilinmeyen çekirdek kişi','Çekirdek ekip kapasitesi (saat)','Toplam planlanan efor (saat)','Toplam plan / çekirdek kapasite (%)','Çekirdek kişisel aşım toplamı (saat)','Çekirdek kişisel boşluk toplamı (saat)','Kapasitesi bilinmeyen çekirdek atama (saat)','Çekirdek planı (saat)','Support planı (saat)','Support kişi','Çekirdek plan / kapasite (%)'],
 ...rows.map(r=>[r.name,r.end,trendSource(r),r.known,r.unknown,r.known||r.supportPeople&&!r.unknown?r.capacity:null,r.people?r.planned:null,r.ratio,r.known?r.over:null,r.known?r.free:null,r.unknownHours,r.corePlanned,r.supportPlanned,r.supportPeople,r.coreRatio])
 ];
}
