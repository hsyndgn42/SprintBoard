import type { CapacityRow, ProductSettings, Task } from './api.service';
export type PlanningPerson={id:string;name:string;capacity:number|null;hours:number;free:number;over:number;x:number;status:string;attention:boolean;row?:CapacityRow};
export type PlanningCheck={task:Task;messages:string[]};
const num=(n:number)=>Number.isFinite(n)?Math.max(0,n):0;
const round=(n:number)=>Math.round(n*100)/100;
export const isLeave=(t:Task)=>t.workKind==='LEAVE'||t.taskSubtype==='LEAVE';
export function planningInsights(items:Task[],rows:CapacityRow[],mode:ProductSettings['estimationMode']){
 // Recalculate the reserve balance for assignment previews, without mutating persisted tasks.
 items=items.map(t=>({...t,assignments:t.assignments.map(a=>({...a,planningHours:a.supportOnly?0:a.estimatedHours}))}));
 for(const r of items.filter(t=>t.taskCategory==='BAU'&&t.taskSubtype==='DEFECT_SUPPORT'))for(const a of r.assignments){
   const used=items.filter(t=>t.reserveTaskId===r.id).flatMap(t=>t.assignments).filter(x=>x.memberId===a.memberId&&!x.supportOnly).reduce((n,x)=>n+num(x.estimatedHours),0);
   a.planningHours=Math.max(0,(a.supportOnly?0:a.estimatedHours)-used);
 }
 const people=new Map<string,PlanningPerson>();
 for(const r of rows)people.set(r.memberId,{id:r.memberId,name:r.memberName,capacity:num(r.availableHours),hours:0,free:0,over:0,x:0,status:'',attention:false,row:r});
 const checks:PlanningCheck[]=[];
 let points=0,pointed=0;
 for(const task of items){
  if(isLeave(task))continue;
  const messages:string[]=[];
  if(!task.assignments.length)messages.push('Kişi ataması yok.');
  for(const a of task.assignments){
   let p=people.get(a.memberId);if(!p){p={id:a.memberId,name:a.memberName,capacity:null,hours:0,free:0,over:0,x:0,status:'',attention:false};people.set(a.memberId,p);}
   if(a.supportOnly)p.x++;else{p.hours+=num(a.planningHours??a.estimatedHours);if(!num(a.estimatedHours))messages.push(a.memberName+': saat girilmemiş (X seçili değil).');}
  }
  if(mode==='POINTS_AND_HOURS'&&task.taskCategory!=='BAU'&&task.type!=='BAU'){
   if(task.storyPoints==null||!Number.isFinite(task.storyPoints)||task.storyPoints<0)messages.push('Story Point tahmini eksik veya geçersiz.');
   else {points+=task.storyPoints;pointed++;}
  }
  if(messages.length)checks.push({task,messages});
 }
 for(const p of people.values()){
  p.hours=round(p.hours);
  if(p.capacity==null){p.status=p.hours>0?'Kapasite kaydı yok':'X destek · kapasite kaydı yok';p.attention=p.hours>0;continue;}
  p.free=round(Math.max(0,p.capacity-p.hours));p.over=round(Math.max(0,p.hours-p.capacity));
  if(p.row?.supportMember&&!p.row.allocationExplicit&&p.hours>0){p.status='Support için ayrılan gün girilmemiş';p.attention=true;}
  else if(p.over>.01){p.status=p.capacity===0?'Kapasite yok; saat atanmış':'Kapasite aşılıyor';p.attention=true;}
  else if(p.free>.01)p.status='Planlanabilir boşluk';
  else p.status=p.capacity===0?'Saat kapasitesi yok':'Dengeli';
 }
 const list=[...people.values()].sort((a,b)=>Number(b.attention)-Number(a.attention)||b.over-a.over||a.name.localeCompare(b.name,'tr'));
 return {people:list,checks,overloaded:list.filter(p=>p.over>.01).length,attention:list.filter(p=>p.attention).length,
  overHours:round(list.reduce((n,p)=>n+p.over,0)),freeHours:round(list.reduce((n,p)=>n+p.free,0)),
  unknownHours:round(list.filter(p=>p.capacity==null).reduce((n,p)=>n+p.hours,0)),
  xCount:list.reduce((n,p)=>n+p.x,0),points:round(points),pointed};
}
export function assignmentPreview(items:Task[],taskId:string,draft:Task['assignments']):Task[]{
 return items.map(t=>t.id===taskId?{...t,assignments:draft}:t);
}

