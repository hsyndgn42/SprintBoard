import type { Task } from '../api.service';

export interface BoardFilters { query: string; memberId: string; category: string; subtype: string }
export const emptyBoardFilters = (): BoardFilters => ({query:'',memberId:'',category:'',subtype:''});
export const BOARD_COLUMNS = [
  {key:'todo',label:'Yapılacak'}, {key:'doing',label:'Devam ediyor'},
  {key:'done',label:'Done'}, {key:'undone',label:'Undone'},
];
const normalize = (value:string) => value.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i');
export function filterBoard(items:Task[], filters:BoardFilters):Task[] {
  const query=normalize(filters.query.trim());
  return items.filter(item=>(!query||normalize([item.name,item.externalId,item.criteria,item.statusNote].filter(Boolean).join(' ')).includes(query))
    && (!filters.memberId||(filters.memberId==='__unassigned__'?item.assignments.length===0:item.assignments.some(a=>a.memberId===filters.memberId)))
    && (!filters.category||item.taskCategory===filters.category)
    && (!filters.subtype||(filters.subtype==='__none__'?!item.taskSubtype:item.taskSubtype===filters.subtype)));
}
export function boardMembers(items:Task[]){
  const members=new Map<string,string>();
  for(const item of items)for(const a of item.assignments)members.set(a.memberId,a.memberName);
  return [...members].map(([id,name])=>({id,name})).sort((a,b)=>a.name.localeCompare(b.name,'tr'));
}
export function boardColor(item:Task):string {
  const palette=['#2563eb','#7c3aed','#0d9488','#d97706','#db2777','#0891b2'];
  let hash=0;for(const char of item.backlogId||item.id)hash=(hash*31+char.charCodeAt(0))>>>0;
  return palette[hash%palette.length];
}
