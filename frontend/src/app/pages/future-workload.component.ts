import {Component,ChangeDetectorRef,EventEmitter,Output,OnInit,inject} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ApiService,formatDate} from '../api.service';
import {ReportHtmlExportComponent} from './report-html-export.component';
import {MemberBarsComponent} from './member-bars.component';
import {FutureWorkload,futureWorkloadReading,forecastPeriodLabel} from './future-workload.model';
import {taskCategoryLabel} from '../task-taxonomy';

@Component({selector:'app-future-workload',standalone:true,imports:[FormsModule,ReportHtmlExportComponent,MemberBarsComponent],template:`
<section class="card card-pad future-workload">
 <div class="rpt-head"><div><span class="eyebrow">İLERİYE BAKIŞ</span><h2>Gelecek iş yükü</h2></div><div class="rpt-actions">
  @if(report){<app-report-html-export [disabled]="loading||!!error||dirty" [report]="{kind:'future',data:report,scope:scope}" />}
  <button class="btn" [disabled]="loading" (click)="load()">{{loading?'Hesaplanıyor…':dirty?'Hesapla':'Yenile'}}</button>
 </div></div>
 <div class="forecast-toolbar">
  <label class="field">Bakılacak dönem<select [(ngModel)]="count" [disabled]="loading" (ngModelChange)="load()"><option [ngValue]="3">Önümüzdeki 3 dönem</option><option [ngValue]="6">Önümüzdeki 6 dönem</option><option [ngValue]="12">Önümüzdeki 12 dönem</option></select></label>
  @if(report){<span>{{scope}}<small>Çekirdek ekip · BAU hariç</small></span>}
 </div>
 <details class="forecast-settings"><summary>Hesap ayarları</summary><div class="rpt-filters">
  <label class="field">Başlangıç tarihi<input type="date" [(ngModel)]="from" [disabled]="loading" [min]="report?.today||''" (ngModelChange)="inputsChanged()"></label>
  <label class="field">Sprint henüz yoksa dönem uzunluğu<select [(ngModel)]="weeks" [disabled]="loading" (ngModelChange)="inputsChanged()"><option [ngValue]="2">2 hafta</option><option [ngValue]="3">3 hafta</option><option [ngValue]="4">4 hafta</option></select></label>
  <label class="field">Varsayılan BAU · gün / kişi<input type="number" min="0" max="42" step="0.5" [(ngModel)]="bauDays" [disabled]="loading" (ngModelChange)="inputsChanged()"></label>
 </div><p class="rpt-aside">Kayıtlı sprintlerin kendi tarihleri ve BAU planı kullanılır. Bu ayarlar, henüz planlanmamış dönemler içindir.</p></details>
 @if(dirty){<p class="forecast-alert" role="status">Ayarlar değişti. Güncellemek için Hesapla’ya basın.</p>}
 @if(error){<p class="forecast-alert" role="alert">{{error}}</p>}
 @if(loading&&!report){<p class="rpt-empty" role="status">İş yükü ve kapasite hesaplanıyor…</p>}
 @if(report&&view){
 <dl class="rpt-kpis forecast-kpis">
  <div><dt>Bekleyen iş yükü</dt><dd>{{fmt(view.core)}} <span>sa</span><small>{{fmt(view.planned)}} sa sprintlere planlandı · {{fmt(view.pool)}} sa havuzda</small></dd></div>
  <div><dt>İşlere ayrılabilir kapasite</dt><dd>{{fmt(view.capacity)}} <span>sa</span><small>İzin, tatil ve BAU düşülmüş</small></dd></div>
  <div><dt>Toplam iş / kapasite</dt><dd [class.over]="view.load!==null&&view.load>100">{{percent(view.load)}}<small>Bekleyen işin seçili kapasiteye oranı</small></dd></div>
 </dl>
 <div class="forecast-reading" [class.attention]="view.tone==='attention'"><strong>{{view.headline}}</strong><p>{{view.detail}}</p></div>
 @if(view.unknown){<p class="forecast-alert"><b>{{view.unknown}} işin saat tahmini eksik.</b> Yukarıdaki yük yalnız bilinen saatleri gösterir; gerçek ihtiyaç daha yüksek olabilir.</p>}
 @if(view.outsideHours){<p class="rpt-aside">Toplam yükün {{fmt(view.outsideHours)}} sa kısmı seçili tarihlerin dışındaki sprintlere planlanmış.</p>}
 <div class="rpt-chart-grid">
  <section class="rpt-chart-card"><h3 class="rpt-sub">İş yükünün dağılımı</h3><p class="rpt-aside">İş tipine göre bekleyen saatler</p>
   <app-member-bars [rows]="categoryBars" unit="sa" label="İş tipine göre sprintlere planlanan ve havuzda bekleyen saatler" />
   <div class="rpt-key"><span><i style="background:#526fb4"></i>Sprintlere planlanan</span><span><i style="background:#40a396"></i>Havuzda bekleyen</span></div>
   @if(!view.categories.length){<p class="rpt-aside">Bekleyen iş yok.</p>}
  </section>
  <section class="rpt-chart-card"><h3 class="rpt-sub">Ekibin hangi alanı dolu?</h3><p class="rpt-aside">Kişilerin uzmanlığına göre yük / kapasite</p>
   <div class="role-loads">@for(r of view.roles;track r.role){@if(r.demand||r.capacity){
    <div class="role-load"><div class="load-heading"><strong>{{r.label}}</strong><b [class.over]="r.demand>r.capacity">{{r.capacity?percent(100*r.demand/r.capacity):'Kapasite yok'}}</b></div>
     <div class="load-track" role="img" [attr.aria-label]="r.label+': '+fmt(r.demand)+' saat iş, '+fmt(r.capacity)+' saat kapasite'"><span [class.excess]="r.demand>r.capacity" [style.width.%]="width(r.demand,r.capacity)"></span></div>
     <div class="load-caption"><span>{{fmt(r.demand)}} sa iş / {{fmt(r.capacity)}} sa kapasite</span>@if(r.demand>r.capacity){<span class="over">{{fmt(r.demand-r.capacity)}} sa fazla</span>}</div>
    </div>
   }}</div>
   @if(!view.capacity&&!view.core){<p class="rpt-aside">Bu dönem için kapasite kaydı yok.</p>}
  </section>
 </div>
 <section class="rpt-chart-card forecast-periods"><div class="period-heading"><h3 class="rpt-sub">Sprintlere göre tahmini doluluk</h3><span>{{view.periods.length}} dönem</span></div>
  <p class="rpt-aside">Sprintteki plana, havuzdan uygun uzmanlıkla alınabilecek saatler eklenir. Havuz dağılımı bir tahmindir.</p>
  <div class="rpt-key"><span><i style="background:#526fb4"></i>Sprintteki plan</span><span><i class="pool-key"></i>Havuzdan alınabilir</span><span><i style="background:#e9eef4"></i>Boş kapasite</span></div>
  <div class="period-loads">@for(p of view.periods;track p.id;let index=$index){
   <article class="period-load"><div class="period-name"><strong>{{periodLabel(p,index)}}</strong><span>{{day(p.start)}} – {{day(p.end)}}</span>@if(p.scenario){<small>Tahmini tarihler</small>}</div>
    <div class="period-measure"><div class="load-heading"><span>{{fmt(p.planned+p.fromPool)}} / {{fmt(p.capacityHours)}} sa</span><b [class.over]="p.scenarioRate!==null&&p.scenarioRate>100">{{percent(p.scenarioRate)}}</b></div>
     <div class="load-track period-track" role="img" [attr.aria-label]="periodLabel(p,index)+': '+fmt(p.planned)+' saat plan, '+fmt(p.fromPool)+' saat havuz, '+fmt(p.capacityHours)+' saat kapasite'">
      <span class="planned" [style.width.%]="share(p.planned,p.capacityHours,p.planned+p.fromPool)"></span><span class="pool" [style.width.%]="share(p.fromPool,p.capacityHours,p.planned+p.fromPool)"></span>
      @if(p.planned+p.fromPool>p.capacityHours&&p.capacityHours>0){<i class="capacity-limit" [style.left.%]="share(p.capacityHours,p.capacityHours,p.planned+p.fromPool)" title="Kapasite sınırı"></i>}
     </div>
     <div class="load-caption"><span>{{fmt(p.planned)}} sa plan + {{fmt(p.fromPool)}} sa havuz</span>@if(p.over){<span class="over">Uzmanlık aşımı: {{fmt(p.over)}} sa</span>}</div>
    </div>
   </article>
  }</div>
 </section>
 <div class="rpt-folds">
  <details><summary><span>Kapasite nasıl hesaplandı?</span><small>İzin · tatil · BAU</small></summary><div class="fold-body">
   <p>Çekirdek ekip kapasitesinden izin, çalışılmayan gün ve BAU düşülür. Kapasiteye dahil edilmiş planlı mesai eklenir.</p>
   <div class="table-wrap"><table><thead><tr><th scope="col">Dönem</th><th scope="col">Ekip kapasitesi</th><th scope="col">Tatil</th><th scope="col">İzin</th><th scope="col">Planlı mesai</th><th scope="col">BAU</th><th scope="col">Kalan</th></tr></thead><tbody>
    @for(p of report.periods;track p.id;let index=$index){<tr><td>{{periodLabel(p,index)}}</td><td>{{fmt(p.nominalHours)}} sa</td><td>−{{fmt(p.offHours)}} sa</td><td>−{{fmt(p.leaveHours)}} sa</td><td>+{{fmt(p.overtimeHours)}} sa</td><td>−{{fmt(p.bauHours)}} sa</td><td><strong>{{fmt(p.capacityHours)}} sa</strong></td></tr>}
   </tbody></table></div>
   @if(view.support||view.reserve){<p>Dış Support: <b>{{fmt(view.support)}} sa</b> · BAU rezervinden karşılanan defectler: <b>{{fmt(view.reserve)}} sa</b>. Bu saatler çekirdek iş yüküne tekrar eklenmez.</p>}
  </div></details>
  <details><summary><span>Hesaplama notları</span>@if(report.warnings.length){<small>{{report.warnings.length}} veri uyarısı</small>}</summary><div class="fold-body">
   @for(w of report.warnings;track w){<p class="forecast-alert">{{w}}</p>}
   <p>Havuz ve planlanan sprintlerdeki açık işler kullanılır. Aktif sprint, Done/Undone ve BAU işleri iş yüküne dahil değildir. Saatli atama varsa atamalar, yoksa saat tahmini esas alınır; Size / Story Point saate çevrilmez.</p>
   <p>Tam çekirdek ekip kapasitesi, katılım tarihleri ve çalışma düzeni kullanılır. Bekleyen izin talepleri henüz düşülmez. Kayıtlı sprintlerde kendi BAU planı, diğer dönemlerde hesap ayarlarındaki BAU günleri kullanılır.</p>
   <p>Havuzdaki işler yalnız uygun uzmanlığın boş kapasitesine dağıtılır. Defectler Development kapasitesini kullanır. İş bağımlılıkları ve kişiye özel iş dağılımı bu tahmine dahil değildir. Bu rapor sprint oluşturmaz, iş taşımaz.</p>
  </div></details>
 </div>
 }
</section>`,styleUrls:['./report-design.css','./future-workload.component.css']})
export class FutureWorkloadComponent implements OnInit{
 @Output() readyChange=new EventEmitter<boolean>();
 private api=inject(ApiService);private cdr=inject(ChangeDetectorRef);
 report:FutureWorkload|null=null;view:ReturnType<typeof futureWorkloadReading>|null=null;loading=false;error='';
 from='';count=3;weeks=3;bauDays:number|null=null;private applied='';
 day=formatDate;periodLabel=forecastPeriodLabel;
 ngOnInit(){void this.load();}
 private inputs(){return JSON.stringify([this.from,this.count,this.weeks,this.bauDays]);}
 get dirty(){return !!this.report&&this.inputs()!==this.applied;}
 inputsChanged(){this.readyChange.emit(!this.loading&&!this.error&&!this.dirty);}
 get scope(){return this.report?this.day(this.report.from)+' – '+this.day(this.report.periods.at(-1)?.end||this.report.from):'';}
 fmt(n:number){return new Intl.NumberFormat('tr-TR',{maximumFractionDigits:1}).format(n);}
 percent(n:number|null){return n===null?'—':'%'+this.fmt(n);}
 width(load:number,capacity:number){return load>0?(capacity>0?Math.min(100,100*load/capacity):100):0;}
 share(hours:number,capacity:number,load:number){return 100*hours/(Math.max(capacity,load)||1);}
 async load(){
  if(this.loading)return;this.loading=true;this.error='';this.readyChange.emit(false);
  const params=new URLSearchParams({periods:String(this.count),weeks:String(this.weeks)});if(this.from)params.set('from',this.from);if(this.bauDays!==null)params.set('bauDays',String(this.bauDays));
  try{const report=await this.api.get<FutureWorkload>('/reports/future-workload?'+params);this.report=report;this.view=futureWorkloadReading(report);this.from=report.from;this.bauDays=report.bauDays;this.applied=this.inputs();}
  catch(e){this.error=String(e);}finally{this.loading=false;this.readyChange.emit(!this.error);this.cdr.detectChanges();}
 }
 get categoryBars(){return this.view?.categories.map(c=>({key:c.category,label:taskCategoryLabel(c.category),note:c.count+' iş'+(c.unknown?' · '+c.unknown+' tahmin eksik':''),segments:[{label:'Sprintlere planlanan',value:c.planned,fill:'#526fb4'},{label:'Havuzda bekleyen',value:c.pool,fill:'#40a396'}]}))||[];}
}
