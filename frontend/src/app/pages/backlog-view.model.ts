import type {BacklogItem} from '../api.service';
export const BACKLOG_VIEWS=[
 {value:'open',label:'Havuz + aktif + planlanan',hint:'Havuz ve açık sprintlerdeki işler; kapanmış sprintlerin sonuçları hariç.'},
 {value:'Ready',label:'Yalnız havuz',hint:'Henüz sprinte alınmamış işler; yeniden planlanacak devam kayıtları dahil.'},
 {value:'ACTIVE',label:'Yalnız aktif sprint',hint:'Devam eden sprintin işleri.'},
 {value:'PLANNED',label:'Yalnız planlanan sprint',hint:'Henüz başlamayan sprintlere alınmış işler.'},
 {value:'POOL_ACTIVE',label:'Havuz + aktif sprint',hint:'Havuzdaki ve aktif sprintteki işler.'},
 {value:'POOL_PLANNED',label:'Havuz + planlanan sprint',hint:'Havuzdaki ve henüz başlamayan sprintlerdeki işler.'},
 {value:'IN_SPRINT',label:'Aktif + planlanan sprint',hint:'Açık sprintlerin işleri; havuz ve kapanmış sprintler hariç.'},
 {value:'all',label:'Tüm işler',hint:'Havuz, sprint işleri ve geçmiş Done / Undone sonuçları; bağlantılı devam kayıtları ayrı gösterilir.'},
 {value:'Done',label:'Done işler',hint:'Done olarak tamamlanan işler.'},
];
export function matchesBacklogView(item:BacklogItem,view:string){
 if(view==='all')return true;
 const pool=item.state==='Ready'&&!item.sprintId,active=item.sprintStatus==='active',planned=item.sprintStatus==='planned';
 if(view==='open')return pool||active||planned;
 if(view==='Ready')return pool;
 if(view==='ACTIVE')return active;
 if(view==='PLANNED')return planned;
 if(view==='POOL_ACTIVE')return pool||active;
 if(view==='POOL_PLANNED')return pool||planned;
 if(view==='IN_SPRINT')return active||planned;
 return item.state===view;
}
