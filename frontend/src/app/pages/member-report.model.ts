import type {MemberReportRow,TeamMember} from '../api.service';

export interface MemberReportSummary {
 memberId:string;memberName:string;title:string;teamRole:string;engagement:string;
 supportTaskCount:number;taskCount:number;effortHours:number;done:number;undone:number;other:number;
 sizeXSmall:number;sizeSmall:number;sizeMedium:number;sizeLarge:number;sizeXLarge:number;pointedTasks:number;storyPointsTotal:number;
}
const totals=['supportTaskCount','taskCount','effortHours','done','undone','other','sizeXSmall','sizeSmall','sizeMedium','sizeLarge','sizeXLarge','pointedTasks','storyPointsTotal'] as const;

/** Current active roster is the population; historical assignments supply the selected period's totals. */
export function activeMemberSummaries(rows:MemberReportRow[],team:TeamMember[],sprintId='',query='',sort='tasks'):MemberReportSummary[]{
 const summaries=new Map<string,MemberReportSummary>();
 for(const m of team.filter(m=>!!m.active))summaries.set(m.id,{
  memberId:m.id,memberName:m.name,title:m.title,teamRole:m.teamRole,engagement:m.engagement,
  supportTaskCount:0,taskCount:0,effortHours:0,done:0,undone:0,other:0,sizeXSmall:0,sizeSmall:0,sizeMedium:0,sizeLarge:0,sizeXLarge:0,pointedTasks:0,storyPointsTotal:0
 });
 for(const row of rows){
  if(sprintId&&row.sprintId!==sprintId)continue;
  const member=summaries.get(row.memberId);if(!member)continue;
  for(const key of totals)member[key]+=row[key]??0;
 }
 const q=query.trim().toLocaleLowerCase('tr-TR');
 const rate=(m:MemberReportSummary)=>m.taskCount?m.done/m.taskCount:0;
 return [...summaries.values()].filter(m=>!q||`${m.memberName} ${m.title} ${m.teamRole} ${m.engagement}`.toLocaleLowerCase('tr-TR').includes(q))
  .sort((a,b)=>(sort==='name'?0:sort==='effort'?b.effortHours-a.effortHours:sort==='delivery'?rate(b)-rate(a):b.taskCount-a.taskCount)||a.memberName.localeCompare(b.memberName,'tr'));
}
