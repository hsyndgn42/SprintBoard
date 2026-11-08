import { ReportHtmlExportComponent } from './report-html-export.component';
import {Component,Input} from '@angular/core';
import {MemberReportRow} from '../api.service';
import {memberContexts} from './member-context.model';
import {SbBulletComponent,Bullet} from './report-charts';
import {MemberBarsComponent} from './member-bars.component';
@Component({selector:'app-member-context',standalone:true,imports:[ReportHtmlExportComponent,SbBulletComponent,MemberBarsComponent],template:`
<div class="rpt-head"><h2>Katılım ve izin</h2><div class="rpt-actions"><app-report-html-export [disabled]="loading" [report]="{kind:'context',rows:rows,members:members,scope:scope}" /></div></div>
<ng-content select="[report-filters]" />
<p class="rpt-verdict" [innerHTML]="verdict"></p>
<p class="rpt-aside">Aktif ekip üyelerinin seçili dönemdeki katılımı. Yük oranı gerçekleşen çalışma veya performans puanı değildir.</p>
@if(summaries.length){
<dl class="rpt-kpis">
<div><dt>Kişi</dt><dd>{{summaries.length}}</dd></div>
<div><dt>Bilinen net kapasite</dt><dd>{{n(totalCapacity)}}<small>sa</small></dd></div>
<div><dt>Planlanan efor</dt><dd>{{n(totalEffort)}}<small>sa</small></dd></div>
<div><dt>Kişi bazında aşım</dt><dd [class.over]="totalOver>0">{{n(totalOver)}}<small>sa</small></dd></div>
</dl>
<section class="rpt-chart-card wide">
<h3 class="rpt-sub">Kişi başına plan ve kapasite sınırı</h3>
<div class="rpt-figure all-members"><sb-bullet [rows]="bullets" unit="sa" label="Kişi başına planlanan efor ve net kapasite sınırı" valueLabel="Plan" targetLabel="Kapasite" /></div>
<div class="rpt-key"><span><i style="background:#1f6f78"></i>Kapasite içinde kalan plan</span><span><i style="background:#c0362c"></i>Kapasite aşımı</span><span><i class="rule"></i>O kişinin net kapasitesi</span><span><i style="background:#9bb4b8"></i>Kapasitesi bilinmeyen</span></div>

</section>
<div class="rpt-chart-grid">
<section class="rpt-chart-card">
 <h3 class="rpt-sub">Kişi bazında izin <span class="chart-total">{{n(totalLeave)}} gün</span></h3>
 <p class="rpt-aside">Seçili dönemde kaydedilen izin günleri.</p>
 <app-member-bars [rows]="leaveBars" unit="gün" label="Aktif ekip üyelerinin kayıtlı izin günleri" />
</section>
<section class="rpt-chart-card">
 <h3 class="rpt-sub">X destek katkısı <span class="chart-total">{{totalX}} atama</span></h3>
 <p class="rpt-aside">Saat tahmini olmayan destek atamaları; efora eklenmez.</p>
 <app-member-bars [rows]="supportBars" unit="atama" label="Aktif ekip üyelerinin X destek atamaları" />
</section>
</div>
<div class="rpt-folds">
<details><summary><span>İzin ve X destek</span><small>{{summaries.length}} kişi</small></summary><div class="fold-body"><div class="table-wrap"><table><caption class="sr-only">Kişi başına izin günü ve X destek ataması.</caption><thead><tr><th scope="col">Kişi</th><th scope="col">İzin</th><th scope="col">X destek</th><th scope="col">Ayrılan gün</th><th scope="col">Plan / kapasite</th></tr></thead><tbody>
@for(m of summaries;track m.id){<tr><td>{{m.name}}<small>{{m.total ? m.total+' sprint · '+m.known+' kapasite kaydı' : 'Dönem kaydı yok'}}</small></td><td>{{n(m.leaveDays)}} gün</td><td>{{m.supportTasks}} iş</td><td>{{m.known?n(m.allocatedDays)+' gün':'—'}}</td><td>{{m.load===null?'—':'%'+n(m.load)}}</td></tr>}
</tbody></table></div></div></details>
<details><summary><span>Nasıl hesaplanıyor?</span></summary><div class="fold-body">
<p>Aşım ve boşluk her kişi için ayrı hesaplanır, sonra toplanır. Ekip toplamını tek kalemde karşılaştırmak birinin boşluğuyla diğerinin aşımını birbirine yedirir.</p>
<p>İzin iş adedine veya efora eklenmez; X, saat tahmini verilmemiş destek atamasıdır. Eksik dönem kapasitesinde oran ve aşım hesaplanmaz; grafikte yalnız planlanan efor görünür.</p>
</div></details>
</div>
}@else{<p class="rpt-empty">Seçili filtrelerde katılım kaydı bulunamadı.</p>}
`,styleUrls:['./report-design.css'],styles:[`
:host{display:block;min-width:0}
.all-members{max-height:none}.chart-total{float:right;color:#61738a;font-size:12px;font-weight:500}.rpt-chart-card app-member-bars{margin-top:18px}
td small{display:block;font-size:11px;color:#8a98a4}
`]})
export class MemberContextComponent {
 @Input() scope='Tüm tamamlanan sprintler';@Input() loading=false;
 @Input({required:true}) rows:MemberReportRow[]=[];
 @Input() members?:{id:string;name:string}[];
 get summaries(){return memberContexts(this.rows,this.members);}
 complete(m:{known:number;total:number}){return m.total>0&&m.known===m.total;}
 get totalLeave(){return this.summaries.reduce((s,m)=>s+m.leaveDays,0);}
 get totalX(){return this.summaries.reduce((s,m)=>s+m.supportTasks,0);}
 get leaveBars(){return this.summaries.map(m=>({key:m.id,label:m.name,note:m.total?undefined:'Dönem kaydı yok',segments:[{label:'İzin',value:m.leaveDays,fill:'#bc824b'}]}));}
 get supportBars(){return this.summaries.map(m=>({key:m.id,label:m.name,note:m.total?undefined:'Dönem kaydı yok',segments:[{label:'X destek',value:m.supportTasks,fill:'#7a66ae'}]}));}
 n(value:number){return new Intl.NumberFormat('tr-TR',{maximumFractionDigits:1}).format(value);}
 private esc(v:string){return v.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!));}

 // Over and spare capacity are summed per person: one person's idle hours must
 // never cancel another person's overload.
 get totalCapacity(){return this.summaries.reduce((n,m)=>n+(m.known?m.availableHours:0),0);}
 get totalEffort(){return this.summaries.reduce((n,m)=>n+m.effortHours,0);}
 get totalOver(){return this.summaries.reduce((n,m)=>n+(this.complete(m)?Math.max(0,m.effortHours-m.availableHours):0),0);}
 get totalSpare(){return this.summaries.reduce((n,m)=>n+(this.complete(m)?Math.max(0,m.availableHours-m.effortHours):0),0);}
 get averageEffort(){return this.summaries.length?this.totalEffort/this.summaries.length:null;}
 get bullets():Bullet[]{return this.summaries.map(m=>({key:m.id,label:m.name,target:this.complete(m)?m.availableHours:null,value:m.effortHours,
  caption:m.name+': '+this.n(m.effortHours)+' sa plan'+(this.complete(m)?', '+this.n(m.availableHours)+' sa kapasite':', kapasite bilgisi eksik')}));}
 get verdict(){
  const people=this.summaries;if(!people.length)return 'Seçili filtrelerde katılım kaydı yok.';
  const over=this.totalOver,spare=this.totalSpare;
  const overloaded=people.filter(m=>this.complete(m)&&m.effortHours>m.availableHours);
  const idle=people.filter(m=>this.complete(m)&&m.availableHours>m.effortHours);
  let text=people.length+' kişide <b>'+this.n(this.totalEffort)+' saat</b> plan, <b>'+this.n(this.totalCapacity)+' saat</b> bilinen net kapasite var.';
  if(over>0)text+=' '+overloaded.length+' kişi kapasitesini toplam <b class="over">'+this.n(over)+' saat</b> aşıyor';
  else if(people.some(m=>this.complete(m)))text+=' Tam kapasite kaydı olan kişilerde aşım yok';
  if(spare>0)text+=', '+idle.length+' kişide <b>'+this.n(spare)+' saat</b> boşluk duruyor.';
  else text+='.';
  const leave=people.reduce((n,m)=>n+m.leaveDays,0);
  if(leave>0)text+=' Dönemde '+this.n(leave)+' gün izin kapasiteden düşüldü.';
  const unknown=people.filter(m=>!this.complete(m));
  if(unknown.length)text+=' '+unknown.length+' kişinin kapasite bilgisi eksik; bu kişiler için oran ve aşım hesaplanmaz.';
  return text;
 }
}
