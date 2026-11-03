import {Component,Input,Output,EventEmitter,OnInit,inject,ChangeDetectorRef} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ApiService,SprintSummary,OvertimeRecord,OvertimeEntry,LeaveRecord,TeamMember} from '../api.service';
import {SbColumnsComponent,SbLinesComponent,Column,Series,Point} from './report-charts';
import {ReportHtmlExportComponent} from './report-html-export.component';
import {OvertimeTrendRow,overtimeTrend,round} from './operational-trends.model';

/**
 * One question: how much overtime did the team actually work, and was it the overtime we
 * planned? The columns break the worked hours into their causes and the tick marks the plan,
 * so the gap between intent and reality is the shape of the chart rather than a number.
 */
@Component({selector:'app-overtime-trend',standalone:true,imports:[FormsModule,SbColumnsComponent,SbLinesComponent,ReportHtmlExportComponent],template:`
<section class="card card-pad overtime-report">

<div class="rpt-head"><h2>Mesai</h2>@if(!sprintId){<div class="rpt-actions"><app-report-html-export [disabled]="loading||!!error" [report]="{kind:'overtime',rows:visible,scope:scope,entries:visibleEntries}"/></div>}</div>

@if(loading){<p class="rpt-empty" role="status">Mesai bilgileri yükleniyor…</p>}
@else if(error){<p class="notice warn" role="alert">{{error}} <button class="btn small" (click)="load()">Yeniden dene</button></p>}
@else{

<p class="rpt-verdict" [innerHTML]="verdict"></p>

@if(!sprintId){<div class="rpt-filters">
<label class="field">Kişi<select [(ngModel)]="memberId" (ngModelChange)="changePerson()"><option value="">Tüm kişiler</option>@for(m of people;track m.id){<option [value]="m.id">{{m.name}}</option>}</select></label>
<label class="field">Sprint<select [(ngModel)]="selected" (ngModelChange)="refresh()"><option value="">Tüm sprintler</option>@for(r of rows;track r.id){<option [value]="r.id">{{r.name}}</option>}</select></label>
</div>}

@if(!history.length){<p class="rpt-empty">Bu kapsamda mesai kaydı yok.</p>}@else{

<dl class="rpt-kpis">
<div><dt>Gerçekleşen</dt><dd>{{sum('earned')}}<small>sa</small></dd></div>
<div><dt>Planlanan</dt><dd>{{sum('planned')}}<small>sa</small></dd></div>
<div><dt>Plansız çalışılan</dt><dd [class.over]="sum('unplanned')>0">{{sum('unplanned')}}<small>sa</small></dd></div>
<div><dt>Mesaiden izin</dt><dd>{{sum('usedDays')}}<small>gün</small></dd></div>
</dl>

<div class="rpt-figure"><sb-columns [columns]="columns" unit="sa" markerLabel="planlanan" label="Sprint bazlı gerçekleşen mesainin plana göre kırılımı ve planlanan mesai çizgisi" /></div>
<div class="rpt-key"><span><i style="background:#1f6f78"></i>Plana bağlı</span><span><i style="background:#c0362c"></i>Plan aşımı</span><span><i style="background:#6b5ca5"></i>Plansız</span><span><i style="background:#b9c4cb"></i>Sınıflandırılmamış</span><span><i class="rule"></i>Planlanan mesai</span></div>

@if(usedAny){
<h3 class="rpt-sub">Mesainin karşılığı izne dönüyor mu</h3>
<div class="rpt-figure"><sb-lines [series]="leaveSeries" [points]="leavePoints" unit="gün" label="Sprint bazlı mesaiden izin kullanımı" /></div>
<div class="rpt-key"><span><i style="background:#1f6f78"></i>Kullanılan izin günü</span></div>
@if(unmatched){<p class="rpt-aside">İzin günleriyle eşleştirilmemiş {{unmatched}} saatlik tarihsel kullanım/düzeltme var; gün toplamına çevrilmedi.</p>}}

<div class="rpt-folds">
@if(!sprintId){<details><summary><span>Sprint sprint rakamlar</span><small>{{visible.length}} sprint</small></summary><div class="fold-body"><div class="table-wrap"><table>
<thead><tr><th scope="col">Sprint</th><th scope="col">Gerçekleşen</th><th scope="col">Planlanan</th><th scope="col">Plana bağlı</th><th scope="col">Kalan plan</th><th scope="col">Aşan</th><th scope="col">Plansız</th><th scope="col">Sınıflanmamış</th><th scope="col">İzin</th></tr></thead>
<tbody>@for(r of visible;track r.id){<tr><td>{{r.name}}{{r.status==='active'?' · aktif':''}}</td><td>{{r.earned}} sa</td><td>{{r.planned}} sa</td><td>{{r.matched||0}} sa</td><td>{{r.remaining||0}} sa</td><td>{{r.excess||0}} sa</td><td>{{r.unplanned||0}} sa</td><td>{{r.unclassified||0}} sa</td><td>{{r.usedDays}} gün</td></tr>}</tbody></table></div></div></details>}

@if(!sprintId&&visibleEntries.length){<details><summary><span>Görev ve Roadmap mesaileri</span><small>{{visibleEntries.length}} kayıt</small></summary><div class="fold-body"><div class="table-wrap"><table>
<thead><tr><th scope="col">Kişi / sprint</th><th scope="col">Görev</th><th scope="col">Roadmap</th><th scope="col">Tür</th><th scope="col">Gerçekleşen</th><th scope="col">Planlanan</th></tr></thead>
<tbody>@for(e of visibleEntries;track e.id){<tr><td>{{e.memberName}} · {{e.sprintName}}</td><td>{{e.taskTitle||'Genel / bağlantı yok'}}</td><td>{{e.roadmapTitle||'Roadmap bağlantısı yok'}}</td><td>{{e.earnedHours>0?(e.planClassification==='PLANNED'?'Plana bağlı':e.planClassification==='UNPLANNED'?'Plansız':'Sınıflandırılmamış'):'Mesai planı'}}</td><td>{{e.earnedHours}} sa</td><td>{{e.plannedHours}} sa</td></tr>}</tbody></table></div>
<p>Yalnız yeni mesai kayıtları görev ve Roadmap taşır. Tarihsel görev bağlantısı olmayan mesailer üst toplamda kalır; tahminle dağıtılmaz.</p></div></details>}

<details><summary><span>Nasıl hesaplanıyor?</span></summary><div class="fold-body">
<p>Gerçekleşen mesai = plana bağlı + plan aşımı + plansız + sınıflandırılmamış. Kalan plan ile aşım her plan için ayrı hesaplanır; kalan plan bir hakediş değildir.</p>
<p>Gerçekleşen kabul edilenler: tarihsel kayıtlar ve onaylanmış ya da doğrudan girilmiş mesailer. Bekleyen talepler sayılmaz. Planlanan mesai kapasiteye ikinci kez eklenmez. Kayıtlı plan yoksa 0 gösterilir, tahmin üretilmez.</p>
<p>{{sprintId?'Bu sprint ve öncesindeki en fazla 7 sprint gösterilir. ':''}}Aktif sprintin rakamı geçicidir.</p>
</div></details>
</div>
}}
</section>`,styleUrls:['./report-design.css'],styles:[`:host{display:block;margin:20px 0}.overtime-report td{overflow-wrap:anywhere}.rpt-sub{margin:32px 0 10px;font-size:15px;color:#15202b}`]})
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
 sum(k:'earned'|'planned'|'usedDays'|'matched'|'remaining'|'excess'|'unplanned'|'unclassified'){return round(this.visible.reduce((n,r)=>n+(r[k]||0),0))}
 get unmatched(){return round(this.visible.reduce((n,r)=>n+r.unmatchedUsedHours,0))}

 get columns():Column[]{return this.history.map(r=>({key:r.id,label:'S'+r.number,marker:r.planned>0?r.planned:null,
  caption:r.name+(r.status==='active'?' (aktif)':'')+': '+r.earned+' sa gerçekleşen, '+r.planned+' sa planlanan',
  segments:[{label:'Plana bağlı',value:r.matched||0,fill:'#1f6f78'},{label:'Plan aşımı',value:r.excess||0,fill:'#c0362c'},{label:'Plansız',value:r.unplanned||0,fill:'#6b5ca5'},{label:'Sınıflandırılmamış',value:r.unclassified||0,fill:'#b9c4cb'}]}));}
 get leaveSeries():Series[]{return [{label:'Mesaiden izin',color:'#1f6f78',kind:'area'}];}
 get leavePoints():Point[]{return this.history.map(r=>({label:'S'+r.number,caption:r.name+': '+r.usedDays+' gün mesaiden izin',values:[r.usedDays]}));}
 get usedAny(){return this.history.some(r=>r.usedDays>0)}

 get verdict(){
  const earned=this.sum('earned'),planned=this.sum('planned'),unplanned=this.sum('unplanned'),excess=this.sum('excess'),days=this.sum('usedDays');
  const who=this.people.find(p=>p.id===this.memberId)?.name;
  const span=who?this.esc(who):(this.visible.length===1?this.esc(this.visible[0].name)+' sprintinde ekip':'Ekip');
  if(earned<=0&&planned<=0)return span+' için kayıtlı mesai yok.';
  let text=span+' <b>'+earned+' saat</b> mesai yaptı';
  text+=planned>0?'; planlanan <b>'+planned+' saatti</b>.':'; bu mesainin kayıtlı bir planı yoktu.';
  const loose=round(unplanned+excess);
  if(loose>0)text+=' Bunun <b class="over">'+loose+' saati</b> plan dışında kaldı.';
  if(days>0)text+=' Karşılığında '+days+' gün izin kullanıldı.';
  else if(earned>0)text+=' Karşılığında henüz izin kullanılmadı.';
  return text;
 }
 private esc(value:string){return value.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!));}

 async load(){this.loading=true;this.error='';this.readyChange.emit(false);try{
 const [s,r,e,l,m]=await Promise.all([this.api.get<SprintSummary[]>('/sprints'),this.api.get<OvertimeRecord[]>('/overtime'),this.api.get<OvertimeEntry[]>('/overtime/entries'),this.api.get<LeaveRecord[]>('/leaves'),this.api.get<TeamMember[]>('/team')]);
 this.sprints=s;this.records=r;this.entries=e;this.leaves=l;const names=new Map(m.map(p=>[p.id,p.name]));for(const row of [...r,...e,...l])if(!names.has(row.memberId))names.set(row.memberId,row.memberName);this.people=[...names].map(([id,name])=>({id,name})).sort((a,b)=>a.name.localeCompare(b.name,'tr'));this.rows=overtimeTrend(s,r,e,l,this.memberId);this.rowsLoaded.emit(this.rows);
 }catch{this.error='Mesai verileri alınamadı; toplamlar gösterilmedi.';}finally{this.loading=false;this.readyChange.emit(!this.error);this.refresh();}}
}
