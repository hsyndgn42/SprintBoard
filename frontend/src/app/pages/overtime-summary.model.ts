import type {TeamMember,OvertimeRecord,OvertimeEntry,LeaveRecord,SprintSummary} from '../api.service';
export interface OvertimeSprintRow {key:string;name:string;number:number;earnedHours:number;usedDays:number;unmatchedUsedHours:number;}
export interface OvertimePerson {memberId:string;memberName:string;earnedHours:number;usedDays:number;rows:OvertimeSprintRow[];}
const round=(n:number)=>Math.round(n*100)/100;
/** Cumulative usage is differenced once; linked historical leaves are not charged twice. */
export function overtimePeople(members:TeamMember[],records:OvertimeRecord[],entries:OvertimeEntry[],leaves:LeaveRecord[],sprints:SprintSummary[]):OvertimePerson[]{
 const names=new Map(members.map(m=>[m.id,m.name]));
 for(const r of [...records,...entries,...leaves])if(!names.has(r.memberId))names.set(r.memberId,r.memberName);
 return [...names].map(([memberId,memberName])=>{
  const rows=new Map<string,OvertimeSprintRow>();
  const row=(id:string|undefined,number:number|undefined,name:string)=>{const sprint=id?sprints.find(s=>s.id===id):sprints.find(s=>s.number===number);const key=sprint?.id||id||'number-'+number;let r=rows.get(key);if(!r){r={key,name:sprint?.name||name||'Sprint belirtilmedi',number:sprint?.number??number??0,earnedHours:0,usedDays:0,unmatchedUsedHours:0};rows.set(key,r);}return r;};
  let cumulative=0;
  for(const s of records.filter(r=>r.memberId===memberId).sort((a,b)=>a.sprintNumber-b.sprintNumber||a.id.localeCompare(b.id))){const r=row(undefined,s.sprintNumber,s.sprintName);r.earnedHours+=s.earnedHours;r.unmatchedUsedHours+=s.usedCumulativeHours-cumulative;cumulative=s.usedCumulativeHours;}
  for(const e of entries.filter(r=>r.memberId===memberId)){const r=row(e.sprintId,undefined,e.sprintName);r.earnedHours+=e.earnedHours;r.unmatchedUsedHours+=e.usedHours;}
  for(const l of leaves.filter(r=>r.memberId===memberId&&r.leaveType==='OVERTIME')){const r=row(l.sprintId,undefined,l.sprintName);r.usedDays+=l.days;if(l.overtimeAccounting==='IN_SNAPSHOT')r.unmatchedUsedHours-=l.overtimeHours;}
  const result=[...rows.values()].map(r=>({...r,earnedHours:round(r.earnedHours),usedDays:round(r.usedDays),unmatchedUsedHours:round(r.unmatchedUsedHours)})).sort((a,b)=>b.number-a.number);
  return {memberId,memberName,earnedHours:round(result.reduce((s,r)=>s+r.earnedHours,0)),usedDays:round(result.reduce((s,r)=>s+r.usedDays,0)),rows:result};
 }).sort((a,b)=>a.memberName.localeCompare(b.memberName,'tr'));
}
