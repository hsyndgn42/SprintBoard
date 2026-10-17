import type { RoadmapItem } from '../api.service';
export const ROADMAP_STATUSES = [
  {value:'planned',label:'Planlandı'}, {value:'active',label:'Devam ediyor'},
  {value:'on_hold',label:'Beklemede'}, {value:'completed',label:'Tamamlandı'},
] as const;
export const ROADMAP_PRIORITIES = [
  {value:'UNSET',label:'Belirtilmemiş'}, {value:'LOW',label:'Düşük'},
  {value:'NORMAL',label:'Normal'}, {value:'HIGH',label:'Yüksek'}, {value:'CRITICAL',label:'Kritik'},
] as const;
export const roadmapStatusLabel = (value:string) => ROADMAP_STATUSES.find(s=>s.value===value)?.label || value;
export const roadmapPriorityLabel = (value:string) => ROADMAP_PRIORITIES.find(p=>p.value===value)?.label || 'Belirtilmemiş';
export interface RoadmapFilters { query:string; status:string; priority:string; kind:string; sort:string; }
export function filterRoadmap(items:RoadmapItem[], f:RoadmapFilters):RoadmapItem[] {
  const query=f.query.trim().toLocaleLowerCase('tr-TR');
  const ranks:Record<string,number>={CRITICAL:0,HIGH:1,NORMAL:2,LOW:3,UNSET:4};
  const date=(a:RoadmapItem,b:RoadmapItem)=>(a.targetDate||'9999-12-31').localeCompare(b.targetDate||'9999-12-31');
  const priority=(a:RoadmapItem,b:RoadmapItem)=>(ranks[a.priority]??4)-(ranks[b.priority]??4);
  const name=(a:RoadmapItem,b:RoadmapItem)=>a.title.localeCompare(b.title,'tr')||a.id.localeCompare(b.id);
  return items.filter(r=>(!f.status||r.status===f.status)&&(!f.priority||r.priority===f.priority)&&(!f.kind||r.kind===f.kind)&&(!query||(r.title+' '+(r.referenceId||'')).toLocaleLowerCase('tr-TR').includes(query)))
    .sort((a,b)=>f.sort==='date'?date(a,b)||priority(a,b)||name(a,b):f.sort==='title'?name(a,b):priority(a,b)||date(a,b)||name(a,b));
}
