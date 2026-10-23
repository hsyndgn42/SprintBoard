import type { BacklogItem } from '../api.service';
import { taskCategoryLabel, taskSubtypeLabel } from '../task-taxonomy';

export type WorkStage = 'pool' | 'planned' | 'active' | 'completed' | 'unknown';
export const STAGES = [
  {key:'pool', label:'Havuz'}, {key:'planned', label:'Planlanan sprint'},
  {key:'active', label:'Aktif sprint'}, {key:'completed', label:'Kapanmış sprint'},
  {key:'unknown', label:'Sprint durumu bilinmiyor'},
];
export const RESULTS = [
  {key:'done',label:'Done / kapalı'}, {key:'doing',label:'Devam ediyor'},
  {key:'todo',label:'Yapılacak'}, {key:'undone',label:'Undone'},
  {key:'planned',label:'Planlandı'}, {key:'pool',label:'Havuzda'},
  {key:'unknown',label:'Durum bilinmiyor'},
];
export interface RoadmapWorkFilters { query:string; result:string; stage:string; sprintId:string; category:string; }
export const emptyWorkFilters = (): RoadmapWorkFilters => ({query:'',result:'',stage:'',sprintId:'',category:''});
export function workStage(item: BacklogItem): WorkStage {
  if (!item.sprintId) return 'pool';
  return ['planned','active','completed'].includes(item.sprintStatus || '') ? item.sprintStatus as WorkStage : 'unknown';
}
export function workResult(item: BacklogItem): string {
  if (workStage(item)==='planned') return 'planned';
  if (!item.sprintId && item.state==='Ready') return 'pool';
  const status=(item.taskStatus || item.state || '').toLowerCase();
  return ['done','undone','todo','doing'].includes(status) ? status : 'unknown';
}
export const resultLabel = (item:BacklogItem) => RESULTS.find(r=>r.key===workResult(item))!.label;
export const stageLabel = (item:BacklogItem) => STAGES.find(r=>r.key===workStage(item))!.label;
export function roadmapWork(items:BacklogItem[], roadmapId:string, f:RoadmapWorkFilters): BacklogItem[] {
  const q=f.query.trim().toLocaleLowerCase('tr-TR');
  return items.filter(item=>item.roadmapId===roadmapId
    && (!q || [item.title,item.externalId,item.sprintName].filter(Boolean).join(' ').toLocaleLowerCase('tr-TR').includes(q))
    && (!f.stage || workStage(item)===f.stage)
    && (!f.sprintId || item.sprintId===f.sprintId)
    && (!f.category || item.taskCategory===f.category)
    && (!f.result || (f.result==='open' ? workResult(item)!=='done' : workResult(item)===f.result)));
}
export interface CountBar {key:string;label:string;count:number;}
export function workAnalysis(items:BacklogItem[]) {
  const types=new Map<string,CountBar>();
  for(const item of items){
    const subtype=item.taskCategory==='DEFECT' ? item.taskSubtype : null;
    const key=subtype || item.taskCategory;
    const label=subtype ? taskSubtypeLabel(subtype) : taskCategoryLabel(item.taskCategory);
    const row=types.get(key) || {key,label,count:0};row.count++;types.set(key,row);
  }
  const done=items.filter(i=>workResult(i)==='done').length;
  return {
    total:items.length, done, open:items.length-done,
    planned:items.filter(i=>workStage(i)==='planned').length,
    rate:items.length ? Math.round(100*done/items.length) : null,
    results:RESULTS.map(r=>({...r,count:items.filter(i=>workResult(i)===r.key).length})).filter(r=>r.count),
    stages:STAGES.map(r=>({...r,count:items.filter(i=>workStage(i)===r.key).length})).filter(r=>r.count),
    types:[...types.values()].sort((a,b)=>b.count-a.count || a.label.localeCompare(b.label,'tr')),
  };
}
