import type {Sprint,CapacityRow} from '../api.service';
import type {OvertimeTrendRow} from './operational-trends.model';
export interface ReviewOperations {sprintId:string;sprintName:string;earned:number;supportHours:number;people:{id:string;name:string;hours:number;xCount:number}[]}
export function reviewOperations(sprint:Sprint,overtime:OvertimeTrendRow[],capacity:CapacityRow[]):ReviewOperations{
 const people=capacity.filter(c=>c.supportMember).map(c=>({id:c.memberId,name:c.memberName,hours:c.plannedHours,
  xCount:sprint.items.filter(t=>t.workKind!=='LEAVE'&&t.taskSubtype!=='LEAVE').reduce((n,t)=>n+t.assignments.filter(a=>a.memberId===c.memberId&&a.supportOnly).length,0)
 })).filter(p=>p.hours>0||p.xCount>0).sort((a,b)=>b.hours-a.hours||a.name.localeCompare(b.name,'tr'));
 return {sprintId:sprint.id,sprintName:sprint.name,earned:overtime.find(r=>r.id===sprint.id)?.earned||0,supportHours:Math.round(people.reduce((n,p)=>n+p.hours,0)*100)/100,people};
}
const h=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function reviewOperationsHtml(r:ReviewOperations):string{
 return `<section class="section review-overtime"><span class="eyebrow">MESAİ</span><h2>${h(r.sprintName)} · Gerçekleşen mesai</h2><div class="contribution-stat"><strong>${r.earned} sa</strong><span>Bu sprintte kayıtlı toplam mesai</span></div></section><section class="section review-external-support"><span class="eyebrow">EKİBE SAĞLANAN DESTEK</span><h2>Ekip dışı destek / Architecture</h2><div class="contribution-stat"><strong>${r.supportHours} sa</strong><span>Atanan destek eforu</span></div><p class="scope">Dış ekip ve Architecture katkısıdır; Defect Support rezervinden ayrıdır. X destek saat toplamına eklenmez. Saatler planlanan görev eforudur.</p>${r.people.length?'<table><thead><tr><th>Support veren kişi</th><th>Atanan destek eforu</th><th>X destek</th></tr></thead><tbody>'+r.people.map(p=>`<tr><td data-label="Support veren kişi">${h(p.name)}</td><td data-label="Atanan destek eforu">${p.hours} sa</td><td data-label="X destek">${p.xCount?p.xCount+' atama':'—'}</td></tr>`).join('')+'</tbody></table>':'<p>Saatli veya X destek ataması yok.</p>'}</section>`;
}
