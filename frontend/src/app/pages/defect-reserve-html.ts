import type {DefectReserveSummary} from '../api.service';
const h=(x:unknown)=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const n=(x:number)=>new Intl.NumberFormat('tr-TR',{maximumFractionDigits:2}).format(x||0);
export function reserveHtml(rows:DefectReserveSummary[]=[]):string{
 if(!rows.length)return '';
 return '<section class="section"><h2>Defect Support · Rezerv ve plan</h2><p>Ayrılan rezerv + aşım = toplam plan. Gerçekleşen süre değil, kişi bazlı planlanan efordur; defect eforu ikinci kez sayılmaz.</p>'+rows.map(r=>{
 const total=r.reservedHours+r.overHours;
 return '<article style="padding:16px 0;break-inside:avoid"><h3>'+h((r.sprintName?r.sprintName+' · ':'')+r.name)+'</h3><div style="height:16px;display:flex;background:#edf1f7;border-radius:8px;overflow:hidden">'+[r.coveredHours,r.remainingHours,r.overHours].map((v,i)=>'<span style="display:block;background:'+['#2563eb','#cbd5e1','#d97706'][i]+';width:'+(total?100*v/total:0)+'%"></span>').join('')+'</div><p>Ayrılan: <b>'+n(r.reservedHours)+' sa</b> · Defectlere dağıtılan: <b>'+n(r.allocatedHours)+' sa</b> · Kalan: <b>'+n(r.remainingHours)+' sa</b> · Aşan: <b>'+n(r.overHours)+' sa</b> · '+r.defectCount+' defect</p>'+(r.unassignedDefectHours?'<p>'+n(r.unassignedDefectHours)+' sa kişi ataması olmayan defect tahmini; rezervden karşılanmaz.</p>':'')+'<ul>'+r.members.map(m=>'<li>'+h(m.memberName)+' — '+n(m.reservedHours)+' sa ayrılan / '+n(m.allocatedHours)+' sa dağıtılan / '+n(m.remainingHours)+' sa kalan / '+n(m.overHours)+' sa aşan</li>').join('')+'</ul></article>';
 }).join('')+'</section>';
}
