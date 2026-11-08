import type {MemberReportRow} from '../api.service';
export function memberContexts(rows:MemberReportRow[],roster?:{id:string;name:string}[]){
 const groups=new Map<string,MemberReportRow[]>();
 for(const row of rows)(groups.get(row.memberId)||groups.set(row.memberId,[]).get(row.memberId)!).push(row);
 const members=roster??[...groups].map(([id,periods])=>({id,name:periods[0].memberName}));
 return members.map(member=>{
   const periods=groups.get(member.id)??[];
   const known=periods.filter(r=>r.availableHours!=null&&Number.isFinite(r.availableHours));
   const sum=(key:'allocatedDays'|'leaveDays'|'availableHours'|'effortHours'|'supportTaskCount',source=periods)=>source.reduce((total,r)=>total+(r[key]??0),0);
   const hours=sum('availableHours',known),matchedEffort=sum('effortHours',known);
   return {id:member.id,name:member.name,periods:[...periods].sort((a,b)=>b.sprintNumber-a.sprintNumber),
     known:known.length,total:periods.length,frozen:periods.filter(r=>r.capacitySource==='FROZEN').length,
     recalculated:periods.filter(r=>r.capacitySource==='RECALCULATED').length,
     allocatedDays:sum('allocatedDays',known),leaveDays:sum('leaveDays'),availableHours:hours,
     supportTasks:sum('supportTaskCount'),effortHours:sum('effortHours'),
     load:known.length===periods.length&&hours>0?100*matchedEffort/hours:null};
 }).sort((a,b)=>a.name.localeCompare(b.name,'tr'));
}
export function capacitySourceLabel(source:MemberReportRow['capacitySource']){
 return ({FROZEN:'Kapanış kaydı',RECALCULATED:'Yeniden hesaplanan',UNSPECIFIED_SUPPORT:'Support / Architect: ayrılan gün belirsiz',UNAVAILABLE:'Kapasite bilgisi yok'})[source];
}
