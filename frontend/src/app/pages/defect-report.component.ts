import {DefectTrendBucket,defectTrend} from './operational-trends.model';
import {SbColumnsComponent,SbRankedComponent,Column,Ranked} from './report-charts';
import {DefectReservesComponent} from './defect-reserve.component';
import type {DefectReserveSummary} from '../api.service';
import { ReportHtmlExportComponent } from './report-html-export.component';
import { Component,OnInit,inject,ChangeDetectorRef,Output,EventEmitter } from '@angular/core';
import { TASK_SUBTYPES, taskSubtypeLabel } from '../task-taxonomy';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService,BacklogItem,SprintSummary,statusText } from '../api.service';
import { emptyDefect,defectLabel,severityOptions,environmentOptions } from '../defect-model';

/**
 * One question: is quality getting better or worse, and where do the defects cluster?
 * The columns answer the first, the four rankings answer the second, and the defect
 * titles stay folded because they are private to the people working them.
 */
@Component({selector:'app-defect-report',standalone:true,imports:[SbColumnsComponent,SbRankedComponent,DefectReservesComponent,ReportHtmlExportComponent,FormsModule,RouterLink],template:`
<section class="card card-pad defect-report">

<div class="rpt-head"><h2>Defect analizi</h2><div class="rpt-actions"><app-report-html-export [disabled]="loading||!!error" [report]="{kind:'defects',trend:trend,reserves:visibleReserves,rows:exportRows,charts:exportCharts,counts:{done:count('status','done'),open:filtered.length-count('status','done')-count('status','undone'),undone:count('status','undone')},scope:filterDescription}" /></div></div>
<p class="rpt-verdict" [innerHTML]="verdict"></p>

<div class="rpt-filters">
<label class="field">Kapsam<select [(ngModel)]="scope" (ngModelChange)="refresh()"><option value="sprints">Tüm sprintler</option><option value="pool">Yalnız backlog havuzu</option><option value="all">Sprintler ve havuz</option>@for(s of sprints;track s.id){<option [value]="s.id">{{ s.name }}</option>}</select></label>
<label class="field">Defect türü<select [(ngModel)]="subtype" (ngModelChange)="refresh()"><option value="">Tümü</option>@for(o of subtypeOptions;track o.value){<option [value]="o.value">{{ o.label }}</option>}</select></label>
<label class="field">Önem<select [(ngModel)]="severity" (ngModelChange)="refresh()"><option value="">Tümü</option>@for(o of severities;track o.value){<option [value]="o.value">{{ o.label }}</option>}</select></label>
<label class="field">Ortam<select [(ngModel)]="environment" (ngModelChange)="refresh()"><option value="">Tümü</option>@for(o of environments;track o.value){<option [value]="o.value">{{ o.label }}</option>}</select></label>
</div>

@if(error){<p class="notice warn" role="alert">{{ error }}</p>}
@else if(!filtered.length){<p class="rpt-empty">Bu filtrelerde defect bulunamadı.</p>}
@else{

<dl class="rpt-kpis">
<div><dt>Seçili kapsam</dt><dd>{{filtered.length}}<small>defect</small></dd></div>
<div><dt>Kapandı</dt><dd>{{count('status','done')}}</dd></div>
<div><dt>Açık</dt><dd [class.over]="open>0">{{open}}</dd></div>
<div><dt>Undone</dt><dd [class.over]="count('status','undone')>0">{{count('status','undone')}}</dd></div>
</dl>

@if(scope==='pool'){<p class="rpt-aside">Backlog havuzundaki işler henüz bir sprinte bağlı değil, bu yüzden sprint trendi gösterilmiyor.</p>}
@else{
<div class="rpt-figure"><sb-columns [columns]="trendColumns" unit="defect" [average]="averagePerSprint" averageLabel="sprint ortalaması" label="Sprint bazlı Test, Prod ve diğer defect sayıları" /></div>
<div class="rpt-key"><span><i style="background:#1f6f78"></i>Test defect</span><span><i style="background:#c0362c"></i>Prod defect</span><span><i style="background:#b9c4cb"></i>Diğer</span><span><i class="dash"></i>Sprint ortalaması</span></div>
}

<h3 class="rpt-sub">Defectler nerede yoğunlaşıyor</h3>
<div class="rpt-grid">@for(chart of charts;track chart.key){<section><h4>{{chart.title}}</h4><sb-ranked [rows]="ranked(chart.key,chart.options,chart.color)" unit="defect" [label]="chart.title" /></section>}</div>

<div class="rpt-folds">
@if(visibleReserves.length){<details><summary><span>Defect rezervi</span><small>{{visibleReserves.length}} sprint</small></summary><div class="fold-body"><app-defect-reserves [rows]="visibleReserves" /><p>Rezerv özeti seçili sprint kapsamını gösterir; tür, önem ve ortam filtreleri yalnız defect sonuçlarına uygulanır.</p></div></details>}

@if(scope!=='pool'&&trend.length){<details><summary><span>Sprint sprint rakamlar</span><small>{{trend.length}} sprint</small></summary><div class="fold-body"><div class="table-wrap"><table>
<thead><tr><th scope="col">Sprint</th><th scope="col">Test</th><th scope="col">Prod</th><th scope="col">Diğer</th><th scope="col">Done</th><th scope="col">Açık</th><th scope="col">Undone</th></tr></thead>
<tbody>@for(r of trend;track r.id){<tr><td>{{r.name}}{{r.status==='active'?' · aktif':''}}</td><td>{{r.test}}</td><td>{{r.prod}}</td><td>{{r.other}}</td><td>{{r.done}}</td><td>{{r.open}}</td><td>{{r.undone}}</td></tr>}</tbody></table></div></div></details>}

<details><summary><span>Defect iş listesi</span><small>{{filtered.length}} kayıt</small></summary><div class="fold-body"><div class="table-wrap"><table>
<thead><tr><th scope="col">İş</th><th scope="col">Önem / ortam</th><th scope="col">Durum</th><th scope="col">Bildiren</th></tr></thead>
<tbody>@for(item of filtered;track item.id){<tr>
 <td><a [routerLink]="item.sprintId?['/sprints',item.sprintId,'planning']:['/backlog']">{{item.title}}</a><small>{{subtypeLabel(item.taskCategory,item.taskSubtype)}} · {{sprintName(item.sprintId)}}</small></td>
 <td>{{label(detail(item).severity,severities)}} · {{label(detail(item).environment,environments)}}</td>
 <td>{{statusText(item.taskStatus||item.state)}}</td>
 <td>{{detail(item).reporterName || (detail(item).reporterId ? 'Ad soyad bekleniyor' : 'Kayıt yok')}}</td>
</tr>}</tbody></table></div></div></details>

<details><summary><span>Nasıl hesaplanıyor?</span></summary><div class="fold-body">
<p>Her defect işi bir kez sayılır. Done olan defect kapanmış ve doğrulanmış kabul edilir; işin tekrarları ayrı kayıttır.</p>
<p>Trend geçmiş sprint sonuçlarını esas alır ve havuzu dışarıda bırakır, bu yüzden mevcut backlog toplamıyla aynı ölçüm değildir. Aktif sprintin rakamı geçicidir.</p>
<p>Önem ve ortamı girilmemiş geçmiş işler varsayılan bir değerle doldurulmaz; "belirtilmemiş" olarak kendi grubunda kalır.</p>
<p class="print-only">{{filterDescription}}</p>
</div></details>
</div>
}
</section>`,styleUrls:['./report-design.css'],styles:[`:host{display:block;margin:20px 0}.defect-report td{overflow-wrap:anywhere}.defect-report td small{display:block;color:#5a6b7b;font-size:11px}.rpt-sub{margin:32px 0 6px;font-size:15px;color:#15202b}.rpt-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 32px}.rpt-grid h4{margin:16px 0 2px;font-size:13px;font-weight:600;color:#5a6b7b}@media(max-width:760px){.rpt-grid{grid-template-columns:1fr}}@media print{.rpt-grid{grid-template-columns:1fr 1fr}.rpt-grid section{break-inside:avoid}}`]})
export class DefectReportComponent implements OnInit {
  @Output() readyChange=new EventEmitter<boolean>();
  get filterDescription(){const scope=({sprints:'Tüm sprintler',pool:'Yalnız backlog havuzu',all:'Sprintler ve havuz'} as Record<string,string>)[this.scope]||this.sprintName(this.scope);return 'Kapsam: '+scope+' / Tür: '+(this.subtype?taskSubtypeLabel(this.subtype):'Tümü')+' / Önem: '+(this.severity?this.label(this.severity,this.severities):'Tümü')+' / Ortam: '+(this.environment?this.label(this.environment,this.environments):'Tümü');}
  trendBuckets:DefectTrendBucket[]=[];
  get trend(){return defectTrend(this.sprints,this.trendBuckets,this.scope,this.subtype,this.severity,this.environment)}
  reserves:DefectReserveSummary[]=[];
  get visibleReserves(){return this.scope==='pool'?[]:this.reserves.filter(r=>this.scope==='all'||this.scope==='sprints'||r.sprintId===this.scope);}
  private api=inject(ApiService);private cdr=inject(ChangeDetectorRef);items:BacklogItem[]=[];sprints:SprintSummary[]=[];loading=true;scope='sprints';subtype='';severity='';environment='';error='';
  severities=severityOptions;environments=environmentOptions;label=defectLabel;statusText=statusText;
  subtypeLabel=(_category:string,subtype:string|null)=>taskSubtypeLabel(subtype);get subtypeOptions(){return TASK_SUBTYPES['DEFECT']||[];}
  get charts(){return [
    {key:'severity',title:'Önem',options:severityOptions,color:'#c0362c'},
    {key:'environment',title:'Ortam',options:environmentOptions,color:'#1f6f78'},
    {key:'subtype',title:'Defect türü',options:this.subtypeOptions,color:'#6b5ca5'},
    {key:'status',title:'Sonuç',options:[{value:'done',label:'Done'},{value:'undone',label:'Undone'},{value:'doing',label:'Devam ediyor'},{value:'todo',label:'Yapılacak'},{value:'Ready',label:'Havuzda'}],color:'#5a6b7b'}];}
  detail(item:BacklogItem){return item.defect||emptyDefect();}refresh(){this.cdr.detectChanges();}
  get filtered(){return this.items.filter(i=>(this.scope==='all'||(this.scope==='sprints'?!!i.sprintId:this.scope==='pool'?!i.sprintId:i.sprintId===this.scope))&&(!this.subtype||i.taskSubtype===this.subtype)&&(!this.severity||this.detail(i).severity===this.severity)&&(!this.environment||this.detail(i).environment===this.environment));}
  get open(){return this.filtered.length-this.count('status','done')-this.count('status','undone');}
  get exportRows(){return this.filtered.map(i=>({title:i.title,subtype:this.subtypeLabel(i.taskCategory,i.taskSubtype),sprint:this.sprintName(i.sprintId),status:this.statusText(i.taskStatus||i.state),severity:this.label(this.detail(i).severity,this.severities),environment:this.label(this.detail(i).environment,this.environments),reporter:this.detail(i).reporterName || (this.detail(i).reporterId?'Ad soyad bekleniyor':'Kayıt yok')}));}
  get exportCharts(){return this.charts.map(c=>({title:c.title,rows:this.bars(c.key,c.options).map(b=>({label:b.label,count:b.count}))}));}
  count(key:string,value:string){return this.filtered.filter(i=>(key==='subtype'?i.taskSubtype:key==='status'?(i.taskStatus||i.state):(this.detail(i) as unknown as Record<string,unknown>)[key])===value).length;}
  bars(key:string,options:{value:string;label:string}[]){return options.map(o=>({...o,count:this.count(key,o.value),percent:this.filtered.length?100*this.count(key,o.value)/this.filtered.length:0}));}
  /** Empty buckets are dropped so a chart never shows a row the team has no example of. */
  ranked(key:string,options:{value:string;label:string}[],color:string):Ranked[]{
   return this.bars(key,options).filter(b=>b.count>0).sort((a,b)=>b.count-a.count)
    .map(b=>({key:b.value,label:b.label,caption:b.label+': '+b.count+' defect',segments:[{label:b.label,value:b.count,fill:color}]}));}
  sprintName(id:string|null){return this.sprints.find(s=>s.id===id)?.name||'Backlog havuzu';}

  get trendColumns():Column[]{return this.trend.map(r=>({key:r.id,label:'S'+r.number,
   caption:r.name+(r.status==='active'?' (aktif)':'')+': '+r.test+' Test, '+r.prod+' Prod, '+r.other+' diğer; '+r.done+' Done, '+r.open+' açık',
   segments:[{label:'Test',value:r.test,fill:'#1f6f78'},{label:'Prod',value:r.prod,fill:'#c0362c'},{label:'Diğer',value:r.other,fill:'#b9c4cb'}]}));}
  get averagePerSprint(){const t=this.trend;return t.length?t.reduce((n,r)=>n+r.test+r.prod+r.other,0)/t.length:null;}

  get verdict(){
   const total=this.filtered.length,done=this.count('status','done'),undone=this.count('status','undone'),prod=this.count('subtype','PROD_DEFECT');
   if(!total)return 'Bu filtrelerde defect yok.';
   const where=({sprints:'Tüm sprintlerde',pool:'Backlog havuzunda',all:'Sprintler ve havuzda'} as Record<string,string>)[this.scope]||this.esc(this.sprintName(this.scope))+' sprintinde';
   let text=where+' <b>'+total+' defect</b> var; '+done+' tanesi kapandı.';
   if(prod>0)text+=' Bunların <b class="over">'+prod+' tanesi Prod</b> kaynaklı.';
   if(undone>0)text+=' <b class="over">'+undone+' defect</b> Undone kapandı.';
   else if(this.open>0)text+=' '+this.open+' tanesi hâlâ açık.';
   const t=this.trend,last=t[t.length-1],prev=t[t.length-2];
   if(this.scope!=='pool'&&last&&prev){
    const now=last.test+last.prod+last.other,before=prev.test+prev.prod+prev.other;
    if(now>before)text+=' Son sprintte açılan defect bir önceki sprinte göre arttı ('+before+' → '+now+').';
    else if(now<before)text+=' Son sprintte açılan defect bir önceki sprinte göre azaldı ('+before+' → '+now+').';
   }
   return text;
  }
  private esc(value:string){return value.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!));}

  async ngOnInit(){this.readyChange.emit(false);try{[this.items,this.sprints,this.reserves,this.trendBuckets]=await Promise.all([this.api.get<BacklogItem[]>('/reports/defects'),this.api.get<SprintSummary[]>('/sprints'),this.api.get<DefectReserveSummary[]>('/reports/defect-reserves'),this.api.get<DefectTrendBucket[]>('/reports/defect-trend')]);}catch(e){this.error=String(e);}finally{this.loading=false;this.cdr.detectChanges();this.readyChange.emit(!this.error);}}
}
