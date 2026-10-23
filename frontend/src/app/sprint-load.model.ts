import type { CapacityRow, Task } from './api.service';
import { isLeave } from './planning-insights.model';

/** Team-level load for the moment work is pulled into a sprint. The per-person view already exists on the
 *  planning screen; what is missing there is effort that nobody owns yet, which is exactly what a freshly
 *  added backlog item is. Counting it separately keeps the warning honest instead of showing a false gap. */
export interface SprintLoad { capacity:number; assigned:number; unassigned:number; planned:number; free:number; over:number; capacityKnown:boolean }

const num=(n:unknown)=>Number.isFinite(Number(n))?Math.max(0,Number(n)):0;
const round=(n:number)=>Math.round(n*100)/100;
const taskAssigned=(t:Task)=>(t.assignments||[]).reduce((n,a)=>n+(a.supportOnly?0:num(a.estimatedHours)),0);

export function sprintLoad(items:Task[]|null|undefined,rows:CapacityRow[]|null|undefined):SprintLoad{
  const work=(items||[]).filter(t=>t&&!isLeave(t));
  const assigned=work.reduce((n,t)=>n+taskAssigned(t),0);
  const unassigned=work.reduce((n,t)=>n+Math.max(0,num(t.estimatedHours)-taskAssigned(t)),0);
  const capacity=(rows||[]).reduce((n,r)=>n+num(r.availableHours),0);
  return load(capacity,assigned,unassigned,!!(rows||[]).length);
}
function load(capacity:number,assigned:number,unassigned:number,capacityKnown:boolean):SprintLoad{
  const planned=assigned+unassigned;
  return {capacity:round(capacity),assigned:round(assigned),unassigned:round(unassigned),planned:round(planned),
    free:round(Math.max(0,capacity-planned)),over:round(Math.max(0,planned-capacity)),capacityKnown};
}
/** A newly added backlog item owns none of its effort yet, so it lands in the unassigned bucket; the
 *  "new work" form can already name owners, so that part is passed separately to keep the split truthful. */
export function loadWith(current:SprintLoad,addedUnassigned:number,addedAssigned=0):SprintLoad{
  return load(current.capacity,current.assigned+num(addedAssigned),current.unassigned+num(addedUnassigned),current.capacityKnown);
}
export function loadMessage(current:SprintLoad,addedUnassigned:number,addedAssigned=0):string{
  if(!current.capacityKnown)return 'Bu sprint için kapasite kaydı yok; kapasite etkisi hesaplanamadı.';
  const next=loadWith(current,addedUnassigned,addedAssigned);
  const head=`Kapasite ${fmt(next.capacity)} sa · planlanan efor ${fmt(next.planned)} sa (atanmış ${fmt(next.assigned)} sa + atanmamış ${fmt(next.unassigned)} sa).`;
  if(next.over>.01)return `${head} Bu iş eklenince kapasite ${fmt(next.over)} sa aşılır.`;
  return `${head} Bu iş eklenince ${fmt(next.free)} sa boşluk kalır.`;
}
export function loadOverruns(current:SprintLoad,addedUnassigned:number,addedAssigned=0):boolean{
  return current.capacityKnown&&loadWith(current,addedUnassigned,addedAssigned).over>.01;
}
function fmt(n:number){return new Intl.NumberFormat('tr-TR',{maximumFractionDigits:2}).format(n);}
