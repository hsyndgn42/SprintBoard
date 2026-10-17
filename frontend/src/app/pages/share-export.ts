import { editorialSprintHtml } from './presentation-html';
import type {ProductSettings, Sprint, TeamMember, ReportRow, WorkTypeReportRow} from '../api.service';
import {taskCategoryLabel, taskSubtypeLabel} from '../task-taxonomy';
import {buildReview, effort, isLeave} from './review.model';

// Export only explicitly selected presentation fields, never serialize API objects.
export const escapeHtml=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function csvCell(value:unknown):string {
  let text=typeof value==='number'?(Number.isFinite(value)?String(value).replace('.',','):''):String(value??'');
  // Protect spreadsheet formula interpretation, including leading whitespace/control characters.
  if(typeof value!=='number'&&/^[\s\u0000-\u001f]*[=+@-]|^[\t\r\n]/.test(text))text="'"+text;
  return '"'+text.replace(/"/g,'""')+'"';
}
export const csv=(rows:unknown[][])=>'\uFEFF'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n')+'\r\n';
export function downloadText(text:string,mime:string,filename:string){
  const url=URL.createObjectURL(new Blob([text],{type:mime}));const link=document.createElement('a');
  link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const num=(n:number)=>new Intl.NumberFormat('tr-TR',{maximumFractionDigits:1}).format(n);
const status=(s:string)=>({active:'Aktif',planned:'Planlandı',completed:'Tamamlandı',todo:'Yapılacak',doing:'Devam ediyor',done:'Done',undone:'Undone'}[s]||s);
export function sprintShareHtml(sprint:Sprint,settings:ProductSettings,createdAt=new Date().toISOString(),team:TeamMember[]=[],nextSprint:Sprint|null=null):string {
  return editorialSprintHtml(sprint,settings,createdAt,team,nextSprint);
}
export function sprintReportCsv(rows:ReportRow[],settings:ProductSettings){
  const size=settings.estimationMode==='SIZE_AND_HOURS';
  return csv([['Kapsam','Sprint','Bitiş','Teslimat işi (BAU hariç)','BAU dahil kayıt','Done','Undone','Teslimat %',...(size?['S','M','L','XL','Size belirtilmeyen']:['Toplam SP','SP kayıtlı iş','SP belirtilmeyen'])],...rows.map(r=>['Tamamlanan sprint / BAU hariç teslimat',r.name,r.end,r.tasks,r.allTasks,r.done,r.undone,r.deliveryRate,...(size?[r.sizeSmall,r.sizeMedium,r.sizeLarge,r.sizeXLarge,r.tasks-r.sizedTasks]:[r.pointedTasks?r.storyPointsTotal:null,r.pointedTasks,r.tasks-r.pointedTasks])])]);
}
export interface MemberExportRow{memberName:string;taskCount:number;effortHours:number;supportTaskCount:number;done:number;undone:number;other:number;sizeSmall:number;sizeMedium:number;sizeLarge:number;sizeXLarge:number;pointedTasks:number;storyPointsTotal:number}
export function memberReportCsv(rows:MemberExportRow[],settings:ProductSettings,period:string){
  const size=settings.estimationMode==='SIZE_AND_HOURS';
  return csv([['Kapsam','Dönem','Kişi','İş ataması','Planlanan saat','X destek işi','Done','Undone','Diğer','Done %',...(size?['S','M','L','XL']:['Toplam SP','SP kayıtlı iş'])],...rows.map(r=>['BAU dahil / Leave hariç; performans puanı değildir',period,r.memberName,r.taskCount,r.effortHours,r.supportTaskCount,r.done,r.undone,r.other,r.taskCount?Math.round(100*r.done/r.taskCount):null,...(size?[r.sizeSmall,r.sizeMedium,r.sizeLarge,r.sizeXLarge]:[r.pointedTasks?r.storyPointsTotal:null,r.pointedTasks])])]);
}
export function workTypeReportCsv(rows:WorkTypeReportRow[]){return csv([['Kapsam','Sprint','Sprint durumu','Ana tür','Alt tür','İş','Planlanan saat (Leave hariç)','Done','Undone','Diğer'],...rows.map(r=>['BAU dahil tüm işler',r.sprintName,status(r.sprintStatus),taskCategoryLabel(r.taskCategory),r.taskSubtype?taskSubtypeLabel(r.taskSubtype):'Belirtilmemiş',r.taskCount,r.effortHours,r.done,r.undone,Math.max(0,r.taskCount-r.done-r.undone)])]);}
