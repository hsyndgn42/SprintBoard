import {Component,Input,Output,EventEmitter,OnInit,inject,ChangeDetectorRef} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ApiService,SprintSummary,OvertimeRecord,OvertimeEntry,LeaveRecord,TeamMember} from '../api.service';
import {ListPagerComponent} from '../list-pager.component';
import {TrendChartComponent} from './trend-chart.component';
import {ReportHtmlExportComponent} from './report-html-export.component';
import {OvertimeTrendRow,overtimeTrend,overtimeSeries,usageSeries,reconciliationSeries,round} from './operational-trends.model';
@Component({selector:'app-overtime-trend',standalone:true,imports:[FormsModule,ListPagerComponent,TrendChartComponent,ReportHtmlExportComponent],template:`
<section class="card card-pad overtime-report">
 <div class="section-head"><div><span class="eyebrow">MESAİ</span><h2>Mesai durumu ve trendi</h2></div>@if(!sprintId){<app-report-html-export [disabled]="loading||!!error" [report]="{kind:'overtime',rows:visible,scope:scope,entries:visibleEntries}"/>}</div>
 @if(loading){<p role="status">Mesai bilgileri yükleniyor…</p>}@else if(error){<p class="notice warn" role="alert">{{error}} <button class="btn small" (click)="load()">Yeniden dene</button></p>}@else{
 @if(!sprintId){<div class="filters"><label class="field period">Kişi<select [(ngModel)]="memberId" (ngModelChange)="changePerson()"><option value="">Tüm kişiler</option>@for(m of people;track m.id){<option [value]="m.id">{{m.name}}</option>}</select></label><label class="field period">Sprint<select [(ngModel)]="selected" (ngModelChange)="refresh()"><option value="">Tüm sprintler</option>@for(r of rows;track r.id){<option [value]="r.id">{{r.name}}</option>}</select></label></div>}
 <p class="data-note">{{scope}}</p><div class="metrics"><div><small>Gerçekleşen mesai</small><strong>{{sum('earned')}} sa</strong></div><div><small>Planlanan mesai</small><strong>{{sum('planned')}} sa</strong></div><div><small>Mesaiden izin kullanımı</small><strong>{{sum('usedDays')}} gün</strong></div></div>
 @if(unmatched){<p class="data-note">İzin günleriyle eşleştirilmemiş tarihsel kullanım/düzeltme: {{unmatched}} sa. Gün toplamına çevrilmedi.</p>}
 <app-trend-chart [labels]="labels" [series]="series" unit="saat" title="Sprint bazlı gerçekleşen ve planlanan mesai"/>
 <h3>Plan ve gerçekleşen eşleştirmesi</h3><div class="metrics"><div><small>Plan kapsamında gerçekleşen</small><strong>{{sum('matched')}} sa</strong></div><div><small>Kalan plan</small><strong>{{sum('remaining')}} sa</strong></div><div><small>Plan aşımı</small><strong>{{sum('excess')}} sa</strong></div><div><small>Plansız gerçekleşen</small><strong>{{sum('unplanned')}} sa</strong></div><div><small>Sınıflandırılmamış geçmiş kayıt</small><strong>{{sum('unclassified')}} sa</strong></div></div>
 <app-trend-chart [labels]="labels" [series]="matchingSeries" unit="saat" title="Plan kapsamında, kalan, aşan ve plansız mesai"/>
 <p class="data-note">Gerçekleşen = plan kapsamında + plan aşımı + plansız + sınıflandırılmamış. Kalan/aşan her plan için ayrı hesaplanır; kalan plan hakediş değildir.</p>
 <h3>Mesaiden izin kullanımı</h3><app-trend-chart [labels]="labels" [series]="usageSeries" unit="gün" title="Sprint bazlı mesaiden izin kullanımı"/>
 <p class="data-note">{{sprintId?'Bu sprint ve önceki en fazla 7 sprint. ':''}}Gerçekleşen: tarihsel kayıtlar ve onaylanmış/doğrudan girilmiş mesailer; bekleyen talepler hariç. Planlanan mesai kapasiteye tekrar eklenmez. Kayıtlı plan yoksa 0 gösterilir. Aktif sprint geçicidir.</p>
 @if(!sprintId){<app-list-pager #pager [items]="visible" label="Mesai trendi"/><div class="table-wrap"><table><thead><tr><th scope="col">Sprint</th><th scope="col">Gerçekleşen</th><th scope="col">Planlanan</th><th scope="col">Plan kapsamında</th><th scope="col">Kalan</th><th scope="col">Aşan</th><th scope="col">Plansız</th><th scope="col">Sınıflandırılmamış</th><th scope="col">Mesaiden izin</th></tr></thead><tbody>@for(r of pager.rows;track r.id){<tr><td>{{r.name}}{{r.status==='active'?' · Aktif':''}}</td><td>{{r.earned}} sa</td><td>{{r.planned}} sa</td><td>{{r.matched||0}} sa</td><td>{{r.remaining||0}} sa</td><td>{{r.excess||0}} sa</td><td>{{r.unplanned||0}} sa</td><td>{{r.unclassified||0}} sa</td><td>{{r.usedDays}} gün</td></tr>}</tbody></table></div>}
 @if(!sprintId&&visibleEntries.length){<h3>Görev / Roadmap mesaileri</h3><p class="data-note">Yalnız yeni mesai kayıtları. Tarihsel görev bağlantısı olmayan mesailer üst toplamda kalır; Roadmap’e tahminle dağıtılmaz.</p><app-list-pager #entryPager [items]="visibleEntries" label="Görev mesaileri"/><div class="table-wrap"><table><thead><tr><th scope="col">Kişi / sprint</th><th scope="col">Görev</th><th scope="col">Roadmap</th><th scope="col">Mesai türü</th><th scope="col">Gerçekleşen</th><th scope="col">Planlanan</th></tr></thead><tbody>@for(e of entryPager.rows;track e.id){<tr><td>{{e.memberName}} · {{e.sprintName}}</td><td>{{e.taskTitle||'Genel / bağlantı yok'}}</td><td>{{e.roadmapTitle||'Roadmap bağlantısı yok'}}</td><td>{{e.earnedHours>0?(e.planClassification==='PLANNED'?'Plana bağlı':e.planClassification==='UNPLANNED'?'Plansız':'Sınıflandırılmamış'):'Mesai planı'}}</td><td>{{e.earnedHours}} sa</td><td>{{e.plannedHours}} sa</td></tr>}</tbody></table></div>}
 }
</section>`,styles:[`.overtime-report{margin:24px 0}.section-head{flex-wrap:wrap;gap:16px}.metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:20px 0}.metrics>div{padding:16px;background:#f8faff;border:1px solid #dce5ef;border-radius:10px}.metrics small,.metrics strong{display:block}.metrics strong{font-size:24px;margin-top:6px}.filters{display:flex;gap:16px;flex-wrap:wrap}.period{flex:1;max-width:300px}.table-wrap{overflow:auto}table{width:100%}@media(max-width:600px){.metrics{grid-template-columns:1fr}}@media print{.period{display:none}}`]})
export class OvertimeTrendComponent implements OnInit{
 @Input() sprintId='';@Output() readyChange=new EventEmitter<boolean>();@Output() rowsLoaded=new EventEmitter<OvertimeTrendRow[]>();
 private api=inject(ApiService);private cdr=inject(ChangeDetectorRef);rows:OvertimeTrendRow[]=[];selected='';loading=true;error='';
 memberId='';people:{id:string;name:string}[]=[];sprints:SprintSummary[]=[];records:OvertimeRecord[]=[];entries:OvertimeEntry[]=[];leaves:LeaveRecord[]=[];
 get scope(){return (this.visible.length===1?this.visible[0].name:'Tüm sprintler')+' · '+(this.memberId?this.people.find(m=>m.id===this.memberId)?.name||'Kişi':'Tüm kişiler')}
 get visibleEntries(){return this.entries.filter(e=>(!this.memberId||e.memberId===this.memberId)&&(!(this.sprintId||this.selected)||e.sprintId===(this.sprintId||this.selected)))}
 changePerson(){this.rows=overtimeTrend(this.sprints,this.records,this.entries,this.leaves,this.memberId);this.refresh()}
 ngOnInit(){void this.load()}refresh(){this.cdr.detectChanges()}
 get visible(){const id=this.sprintId||this.selected;return id?this.rows.filter(r=>r.id===id):this.rows}
 get history(){return this.sprintId?this.rows.filter(r=>r.number<=(this.visible[0]?.number??-1)).slice(-8):this.visible}
 get matchingSeries(){return reconciliationSeries(this.history)}
 get labels(){return this.history.map(r=>'S'+r.number)}get series(){return overtimeSeries(this.history)}get usageSeries(){return usageSeries(this.history)}
 sum(k:'earned'|'planned'|'usedDays'|'matched'|'remaining'|'excess'|'unplanned'|'unclassified'){return round(this.visible.reduce((n,r)=>n+(r[k]||0),0))}
 get unmatched(){return round(this.visible.reduce((n,r)=>n+r.unmatchedUsedHours,0))}
 async load(){this.loading=true;this.error='';this.readyChange.emit(false);try{
 const [s,r,e,l,m]=await Promise.all([this.api.get<SprintSummary[]>('/sprints'),this.api.get<OvertimeRecord[]>('/overtime'),this.api.get<OvertimeEntry[]>('/overtime/entries'),this.api.get<LeaveRecord[]>('/leaves'),this.api.get<TeamMember[]>('/team')]);
 this.sprints=s;this.records=r;this.entries=e;this.leaves=l;const names=new Map(m.map(p=>[p.id,p.name]));for(const row of [...r,...e,...l])if(!names.has(row.memberId))names.set(row.memberId,row.memberName);this.people=[...names].map(([id,name])=>({id,name})).sort((a,b)=>a.name.localeCompare(b.name,'tr'));this.rows=overtimeTrend(s,r,e,l,this.memberId);this.rowsLoaded.emit(this.rows);
 }catch{this.error='Mesai verileri alınamadı; toplamlar gösterilmedi.';}finally{this.loading=false;this.readyChange.emit(!this.error);this.refresh();}}
}
