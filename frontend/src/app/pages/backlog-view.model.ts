import type {BacklogItem} from '../api.service';
export const BACKLOG_VIEWS=[
 {value:'open',label:'Havuz + sprint',hint:'Havuzdaki ve sprintte işlem gören işler.'},
 {value:'Ready',label:'Yalnız havuz',hint:'Henüz sprinte alınmamış işler; yeniden planlanacak devam kayıtları dahil.'},
 {value:'IN_SPRINT',label:'Sprintte',hint:'Sprintte işlem gören işler. Tamamlanmış sonuçlar Done veya Tüm işler görünümünde.'},
 {value:'all',label:'Tüm işler',hint:'Havuz, sprint işleri ve geçmiş Done / Undone sonuçları; bağlantılı devam kayıtları ayrı gösterilir.'},
 {value:'Done',label:'Done işler',hint:'Done olarak tamamlanan işler.'},
];
export function matchesBacklogView(item:BacklogItem,view:string){
 if(view==='all')return true;
 if(view==='open')return item.state==='Ready'||item.state==='IN_SPRINT';
 return item.state===view;
}
