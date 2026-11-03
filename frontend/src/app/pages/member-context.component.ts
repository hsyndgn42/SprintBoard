import { ReportHtmlExportComponent } from './report-html-export.component';
import {Component,Input} from '@angular/core';
import {RouterLink} from '@angular/router';
import {MemberReportRow} from '../api.service';
import {memberContexts,capacitySourceLabel} from './member-context.model';
import {SbRankedComponent,Ranked} from './report-charts';
@Component({selector:'app-member-context',standalone:true,imports:[ReportHtmlExportComponent,RouterLink,SbRankedComponent],template:`
<div class="rpt-head"><h2>Katılım bağlamı</h2><div class="rpt-actions"><app-report-html-export [disabled]="loading" [report]="{kind:'context',rows:rows,scope:scope}" /></div></div>
<p class="rpt-verdict" [innerHTML]="verdict"></p>
<p class="rpt-aside">Dönem ve kişi filtreleri Kişi dağılımı sekmesiyle ortaktır. Yük oranı gerçekleşen çalışma veya performans puanı değildir.</p>
@if(summaries.length){
<dl class="rpt-kpis">
<div><dt>Kişi</dt><dd>{{summaries.length}}</dd></div>
<div><dt>Net kapasite</dt><dd>{{n(totalCapacity)}}<small>sa</small></dd></div>
<div><dt>Planlanan efor</dt><dd>{{n(totalEffort)}}<small>sa</small></dd></div>
<div><dt>Kişi bazında aşım</dt><dd [class.over]="totalOver>0">{{n(totalOver)}}<small>sa</small></dd></div>
</dl>
<div class="rpt-figure"><sb-ranked [rows]="ranked" unit="sa" [average]="averageEffort" averageLabel="kişi başına ortalama plan" label="Kişi başına kapasite ve plan karşılaştırması" /></div>
<div class="rpt-key"><span><i style="background:#1f6f78"></i>Kapasite içinde kalan plan</span><span><i style="background:#c0362c"></i>Kapasite aşımı</span><span><i style="background:#b9c4cb"></i>Boşta kapasite</span><span><i class="dash"></i>Kişi başına ortalama plan</span></div>

<div class="rpt-folds">
<details><summary><span>İzin ve X destek</span><small>{{summaries.length}} kişi</small></summary><div class="fold-body"><div class="table-wrap"><table><caption class="sr-only">Kişi başına izin günü ve X destek ataması.</caption><thead><tr><th scope="col">Kişi</th><th scope="col">İzin</th><th scope="col">X destek</th><th scope="col">Ayrılan gün</th><th scope="col">Plan / kapasite</th></tr></thead><tbody>
@for(m of summaries;track m.id){<tr><td>{{m.name}}<small>{{m.total}} sprint · {{m.known}} kapasite kaydı</small></td><td>{{n(m.leaveDays)}} gün</td><td>{{m.supportTasks}} iş</td><td>{{m.known?n(m.allocatedDays)+' gün':'—'}}</td><td>{{m.load===null?'—':'%'+n(m.load)}}</td></tr>}
</tbody></table></div></div></details>
<details><summary><span>Kişi kişi sprint kayıtları</span></summary><div class="fold-body">
@for(m of summaries;track m.id){<section class="person"><h4>{{m.name}}<small>{{m.frozen}} kapanış kaydı · {{m.recalculated}} yeniden hesaplanan</small></h4>
@if(m.known<m.total){<p class="warn">Kapasite {{m.known}} / {{m.total}} sprintte hesaplanabiliyor; birleşik yük oranı üretilmez.</p>}
@if(m.recalculated){<p class="rpt-aside">Kapanış kaydı olmayan dönemler mevcut takım, takvim ve izin kayıtlarıyla yeniden hesaplanır; kesin tarihsel kapasite değildir.</p>}
<div class="table-wrap"><table><thead><tr><th scope="col">Sprint</th><th scope="col">Kaynak</th><th scope="col">Ayrılan</th><th scope="col">İzin</th><th scope="col">Kapasite</th><th scope="col">Plan</th><th scope="col">X</th></tr></thead><tbody>
@for(p of m.periods;track p.sprintId){<tr><td><a [routerLink]="['/sprints',p.sprintId,'capacity']">{{p.sprintName}}</a></td><td>{{sourceLabel(p.capacitySource)}}<small>{{p.allocationExplicit?'Sprint için girilen':p.capacitySource==='FROZEN'?'Kapanışta kayıtlı':'Varsayılan'}}</small></td><td>{{p.allocatedDays===null?'—':n(p.allocatedDays)+' gün'}}</td><td>{{n(p.leaveDays)}} gün</td><td>{{p.availableHours===null?'—':n(p.availableHours)+' sa'}}</td><td>{{n(p.effortHours)}} sa<small>{{p.overtimeHours?n(p.overtimeHours)+' sa planlı mesai':''}}</small></td><td>{{p.supportTaskCount}}@if(p.unestimatedTaskCount){<small>{{p.unestimatedTaskCount}} işte saat yok</small>}</td></tr>}
</tbody></table></div></section>}
</div></details>
<details><summary><span>Nasıl hesaplanıyor?</span></summary><div class="fold-body">
<p>Aşım ve boşluk her kişi için ayrı hesaplanır, sonra toplanır. Ekip toplamını tek kalemde karşılaştırmak birinin boşluğuyla diğerinin aşımını birbirine yedirir.</p>
<p>İzin iş adedine veya efora eklenmez; X, saat tahmini verilmemiş destek atamasıdır. Kapasitesi bilinmeyen kişiler grafikte yalnız planlanan eforla görünür.</p>
</div></details>
</div>
}@else{<p class="rpt-empty">Seçili filtrelerde katılım kaydı bulunamadı.</p>}
`,styleUrls:['./report-design.css'],styles:[`
:host{display:block;min-width:0}
.person{margin:0 0 22px}.person h4{margin:0 0 6px;font-size:13px;font-weight:600;color:#15202b;display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}.person h4 small{font-weight:400;font-size:11px;color:#8a98a4}
.warn{margin:0 0 8px;font-size:12px;color:#8c5c20}
td small{display:block;font-size:11px;color:#8a98a4}
`]})
export class MemberContextComponent {
 @Input() scope='Tüm tamamlanan sprintler';@Input() loading=false;
 @Input({required:true}) rows:MemberReportRow[]=[];
 get summaries(){return memberContexts(this.rows);}
 sourceLabel=capacitySourceLabel;
 n(value:number){return new Intl.NumberFormat('tr-TR',{maximumFractionDigits:1}).format(value);}
 private esc(v:string){return v.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!));}

 // Over and spare capacity are summed per person: one person's idle hours must
 // never cancel another person's overload.
 get totalCapacity(){return this.summaries.reduce((n,m)=>n+(m.known?m.availableHours:0),0);}
 get totalEffort(){return this.summaries.reduce((n,m)=>n+m.effortHours,0);}
 get totalOver(){return this.summaries.reduce((n,m)=>n+(m.known?Math.max(0,m.effortHours-m.availableHours):0),0);}
 get totalSpare(){return this.summaries.reduce((n,m)=>n+(m.known?Math.max(0,m.availableHours-m.effortHours):0),0);}
 get averageEffort(){return this.summaries.length?this.totalEffort/this.summaries.length:null;}
 get ranked():Ranked[]{return this.summaries.map(m=>{
  const cap=m.known?m.availableHours:0,within=m.known?Math.min(m.effortHours,cap):m.effortHours;
  const over=m.known?Math.max(0,m.effortHours-cap):0,spare=m.known?Math.max(0,cap-m.effortHours):0;
  return {key:m.id,label:m.name,
   note:(m.known?this.n(cap)+' sa kapasite':'kapasite yok')+' · '+this.n(m.leaveDays)+' gün izin'+(m.supportTasks?' · '+m.supportTasks+' X':''),
   caption:m.name+': '+this.n(m.effortHours)+' sa plan'+(m.known?', '+this.n(cap)+' sa kapasite':'')+(over?', '+this.n(over)+' sa aşım':spare?', '+this.n(spare)+' sa boşta':''),
   segments:[{label:'Plan',value:within,fill:'#1f6f78'},{label:'Aşım',value:over,fill:'#c0362c'},{label:'Boşta',value:spare,fill:'#b9c4cb'}]};
 });}
 get verdict(){
  const people=this.summaries;if(!people.length)return 'Seçili filtrelerde katılım kaydı yok.';
  const over=this.totalOver,spare=this.totalSpare;
  const overloaded=people.filter(m=>m.known&&m.effortHours>m.availableHours);
  const idle=people.filter(m=>m.known&&m.availableHours-m.effortHours>=4);
  let text=people.length+' kişide <b>'+this.n(this.totalEffort)+' saat</b> plan, <b>'+this.n(this.totalCapacity)+' saat</b> net kapasite var.';
  if(over>0)text+=' '+overloaded.length+' kişi kapasitesini toplam <b class="over">'+this.n(over)+' saat</b> aşıyor';
  else text+=' Kimse kapasitesini aşmıyor';
  if(spare>0)text+=', '+idle.length+' kişide <b>'+this.n(spare)+' saat</b> boşluk duruyor.';
  else text+='.';
  const leave=people.reduce((n,m)=>n+m.leaveDays,0);
  if(leave>0)text+=' Dönemde '+this.n(leave)+' gün izin kapasiteden düşüldü.';
  const unknown=people.filter(m=>m.known<m.total);
  if(unknown.length)text+=' '+unknown.length+' kişinin kapasitesi bazı sprintlerde eksik; oranları bu yüzden kısmi.';
  return text;
 }
}
