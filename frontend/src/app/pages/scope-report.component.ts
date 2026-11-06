import {Component,OnInit,OnDestroy,Output,EventEmitter,inject,ChangeDetectorRef} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ApiService,Sprint} from '../api.service';
import {ScopeFigureComponent} from './scope-figure.component';
import {scopeReportHtml} from './scope-report-html';
import {downloadText} from './share-export';
import {METHODOLOGY,EFFORT_NOTE,RECONCILIATION_NOTE,TOTALS_NOTE,UNAVAILABLE_NOTE,SCOPE_COLORS,
 buildScopeReport,coverageFigure,coverageSentence,hours,items,movementFigure,num,shortDate,
 sprintStatusLabel,stamp,trackingLabel,unavailableSentence,urgentFigure,waterfallFigure,
 type ScopeReport,type SprintScope} from './scope-report.model';

/**
 * "Acil İşler ve Kapsam Değişimi" in five layers: what the data covers, what the period adds up
 * to, what it looks like, which sprints differ, and how any of it was calculated.
 *
 * The order is deliberate. The old screen opened on sprint detail and repeated the same
 * methodology paragraph under every sprint, including fifteen sprints that had no history at
 * all, so a reader had to scroll past nothing to reach something. Sprints without history now
 * appear once, as a count, and never as a zero.
 */
@Component({selector:'app-scope-report',standalone:true,imports:[FormsModule,ScopeFigureComponent],template:`
<section class="card card-pad scope-report">

<div class="rpt-head">
 <h2 id="scope-report-title">Acil İşler ve Kapsam Değişimi</h2>
 <div class="rpt-actions">
  <button class="btn" [disabled]="loading||!!error" (click)="download()">HTML indir</button>
  <button class="btn" [disabled]="loading||!!error" (click)="print()">Yazdır</button>
 </div>
</div>

@if(loading){<p class="rpt-empty" role="status">Kapsam geçmişi yükleniyor…</p>}
@else if(error){<p class="notice warn" role="alert">{{error}} <button class="btn small" (click)="load()">Tekrar dene</button></p>}
@else{
<dl class="scope-head">
 @if(team()){<div><dt>Ekip</dt><dd>{{team()}}</dd></div>}
 <div><dt>Sprint aralığı</dt><dd>{{report.sprintRange}}</dd></div>
 <div><dt>Efor türü</dt><dd>{{report.effortBasis}}</dd></div>
 <div><dt>Kapsam</dt><dd>{{filterLabel}}</dd></div>
 <div><dt>Oluşturulma</dt><dd>{{generated}}</dd></div>
</dl>

<div class="rpt-filters">
 <label class="field">Sprint
  <select [(ngModel)]="selected" (ngModelChange)="changed()">
   <option value="">Tüm sprintler</option>
   @for(s of rows;track s.id){<option [value]="s.id">{{s.name}}</option>}
  </select>
 </label>
</div>

<h3 class="rpt-sub">Veri Kapsamı</h3>
<div class="rpt-figure"><sb-scope-figure [figure]="coverageChart" /></div>
<p class="scope-caution">{{unavailableNote}}</p>

@if(!report.tracked.length){
 <p class="rpt-empty">Bu kapsamda kapsam değişimi takibi yapılan sprint yok; karşılaştırma ve dönem toplamı üretilemiyor.</p>
}@else{

<h3 class="rpt-sub">Dönem Özeti</h3>
<dl class="rpt-kpis">
 <div><dt>Takipli sprint</dt><dd>{{measured}}<small>sprint</small></dd></div>
 <div><dt>Sonradan eklenen</dt><dd [class.over]="report.addedItems>0">{{report.addedItems}}<small>iş</small></dd></div>
 <div><dt>Eklenen efor</dt><dd [class.over]="report.addedHours>0">{{fmt(report.addedHours)}}<small>sa</small></dd></div>
 <div><dt>Backlog’a dönen</dt><dd>{{report.removedItems}}<small>iş</small></dd></div>
</dl>
<dl class="rpt-kpis">
 <div><dt>Çıkarılan efor</dt><dd>{{fmt(report.removedHours)}}<small>sa</small></dd></div>
 <div><dt>Acil / plansız iş</dt><dd [class.over]="report.urgentCount>0">{{report.urgentCount}}<small>iş</small></dd></div>
 <div><dt>Acil iş eforu</dt><dd>{{fmt(report.urgentHours)}}<small>sa</small></dd></div>
 <div><dt>Acil iş tamamlanma</dt><dd>{{report.urgentCompletion==null?'—':'%'+report.urgentCompletion}}<small>{{report.urgentDone}}/{{report.urgentCount}}</small></dd></div>
</dl>
<p class="scope-caution">{{totalsNote}}</p>

<h3 class="rpt-sub">Grafiksel Analiz</h3>
<div class="scope-charts">
 <div>
  <h4>Acil iş durumu</h4>
  <div class="rpt-figure"><sb-scope-figure [figure]="urgentChart" /></div>
  @if(report.statusShares.length){<div class="rpt-key">@for(s of report.statusShares;track s.key){<span><i [style.background]="s.fill"></i>{{s.label}} · {{s.count}}</span>}</div>}
 </div>
 <div>
  <h4>Sprint kapsam hareketi</h4>
  <div class="rpt-figure"><sb-scope-figure [figure]="movementChart" /></div>
  <div class="rpt-key"><span><i [style.background]="color.added"></i>Sonradan eklenen</span><span><i [style.background]="color.removed"></i>Backlog’a dönen</span></div>
 </div>
</div>

@if(report.findings.length){
<h3 class="rpt-sub">Öne Çıkan Bulgular</h3>
<ul class="scope-findings">@for(f of report.findings;track f){<li>{{f}}</li>}</ul>
}

<h3 class="rpt-sub">Takipli Sprint Karşılaştırması</h3>
<div class="table-wrap" tabindex="0" role="region" aria-label="Takipli sprint karşılaştırması">
 <table class="scope-table">
  <caption class="sr-only">Takipli sprintlerin başlangıç kapsamı, kapsam hareketleri, mutabakat farkı ve acil iş durumu.</caption>
  <thead><tr>
   <th scope="col">Sprint</th><th scope="col">Durum</th><th scope="col">Takip</th>
   <th scope="col">Başlangıç</th><th scope="col">Eklenen</th><th scope="col">Çıkarılan</th><th scope="col">Güncel</th>
   <th scope="col">Mutabakat farkı</th><th scope="col">Acil iş</th><th scope="col">Acil efor</th><th scope="col">Acil tamamlanma</th>
  </tr></thead>
  <tbody>@for(s of report.tracked;track s.id){<tr>
   <td data-label="Sprint"><strong>{{s.name}}</strong></td>
   <td data-label="Durum"><span class="badge" [class.mute]="s.status==='completed'" [class.info]="s.status!=='completed'">{{statusOf(s)}}</span></td>
   <td data-label="Takip"><span class="badge" [class.info]="s.tracking==='FULL'" [class.warn]="s.tracking==='PARTIAL'">{{trackOf(s)}}</span></td>
   <td data-label="Başlangıç">{{s.baselineItems}} iş · {{fmt(s.baselineHours)}} sa</td>
   <td data-label="Eklenen">+{{s.addedItems}} iş · {{fmt(s.addedHours)}} sa</td>
   <td data-label="Çıkarılan">{{s.removedItems?'−':''}}{{s.removedItems}} iş · {{fmt(s.removedHours)}} sa</td>
   <td data-label="Güncel">{{s.currentItems}} iş · {{fmt(s.currentHours)}} sa</td>
   <td data-label="Mutabakat farkı">@if(s.reconciliationHours===0){<span class="void">0 sa</span>}@else{<span class="flag">{{s.reconciliationHours>0?'+':'−'}}{{fmt(abs(s.reconciliationHours))}} sa</span>}</td>
   <td data-label="Acil iş">{{s.urgentCount}} iş</td>
   <td data-label="Acil efor">{{fmt(s.urgentHours)}} sa</td>
   <td data-label="Acil tamamlanma">{{s.urgentCompletion==null?'—':'%'+s.urgentCompletion}}</td>
  </tr>}</tbody>
 </table>
</div>

<h3 class="rpt-sub">Takipli Sprint Detayları</h3>
@for(s of report.tracked;track s.id){
<section class="scope-sprint" [attr.aria-labelledby]="'scope-sprint-'+s.id">
 <h4 [id]="'scope-sprint-'+s.id">{{s.name}}</h4>
 <p class="scope-meta">
  <span class="badge" [class.mute]="s.status==='completed'" [class.info]="s.status!=='completed'">{{statusOf(s)}}</span>
  <span class="badge" [class.info]="s.tracking==='FULL'" [class.warn]="s.tracking==='PARTIAL'">{{trackOf(s)}}</span>
  <span>{{day(s.start)}} – {{day(s.end)}}</span>
  @if(s.trackedAt){<span>Takip başlangıcı: {{day(s.trackedAt)}}</span>}
 </p>
 <p class="rpt-aside">{{effortNote}}</p>
 <dl class="rpt-kpis">
  <div><dt>{{baselineLabel(s)}}</dt><dd>{{s.baselineItems}}<small>iş · {{fmt(s.baselineHours)}} sa</small></dd></div>
  <div><dt>Sonradan eklenen</dt><dd [class.over]="s.addedItems>0">+{{s.addedItems}}<small>iş · {{fmt(s.addedHours)}} sa</small></dd></div>
  <div><dt>Backlog’a dönen</dt><dd>{{s.removedItems?'−':''}}{{s.removedItems}}<small>iş · {{fmt(s.removedHours)}} sa</small></dd></div>
  <div><dt>Güncel kapsam</dt><dd>{{s.currentItems}}<small>iş · {{fmt(s.currentHours)}} sa</small></dd></div>
 </dl>
 <div class="rpt-figure"><sb-scope-figure [figure]="waterfall(s)" /></div>
 <div class="rpt-key">
  <span><i [style.background]="color.baseline"></i>{{baselineLabel(s)}}</span>
  <span><i [style.background]="color.added"></i>Eklenen</span>
  <span><i [style.background]="color.removed"></i>Çıkarılan</span>
  <span><i [style.background]="color.reconciliation"></i>Mutabakat farkı</span>
  <span><i [style.background]="color.current"></i>Güncel plan</span>
 </div>
 @if(s.reconciliationHours!==0){<p class="scope-flagged">Mutabakat farkı {{s.reconciliationHours>0?'+':'−'}}{{fmt(abs(s.reconciliationHours))}} sa. {{reconciliationNote}}</p>}
 <p class="rpt-aside">{{urgentLine(s)}}</p>

 <div class="table-wrap" tabindex="0" role="region" [attr.aria-label]="s.name+' acil ve plansız işler'">
  <table class="scope-table">
   <caption class="sr-only">{{s.name}} · acil ve plansız işler; durum, planlanan efor, giriş tarihi ve gerekçe kaydı.</caption>
   <thead><tr><th scope="col">İş</th><th scope="col">Durum</th><th scope="col">Planlanan efor</th><th scope="col">Giriş tarihi</th><th scope="col">İş tipi</th><th scope="col">Gerekçe kaydı</th></tr></thead>
   <tbody>
    @for(u of s.urgent;track u.id){<tr>
     <td data-label="İş"><strong>{{u.name}}</strong>@if(u.externalId){<small>{{u.externalId}}</small>}</td>
     <td data-label="Durum"><span class="badge" [class]="'badge '+tone(u.status)">{{u.statusText}}</span></td>
     <td data-label="Planlanan efor">{{fmt(u.hours)}} sa</td>
     <td data-label="Giriş tarihi">{{day(u.at)}}</td>
     <td data-label="İş tipi">{{u.category}}</td>
     <td data-label="Gerekçe kaydı">@if(u.reason.trim()){{{u.reason}}}@else{<span class="void">Kayıt yok</span>}</td>
    </tr>}
    @if(!s.urgent.length){<tr><td colspan="6" class="void">Bu sprintte acil veya plansız olarak işaretlenmiş iş yok.</td></tr>}
   </tbody>
  </table>
 </div>

 <div class="table-wrap" tabindex="0" role="region" [attr.aria-label]="s.name+' backlog’a geri gönderilen işler'">
  <table class="scope-table">
   <caption class="sr-only">{{s.name}} · backlog’a geri gönderilen işler; planlanan efor, çıkış tarihi, önceki durum ve gerekçe kaydı.</caption>
   <thead><tr><th scope="col">İş</th><th scope="col">Planlanan efor</th><th scope="col">Çıkış tarihi</th><th scope="col">Önceki durum</th><th scope="col">Kapsam durumu</th><th scope="col">Gerekçe kaydı</th><th scope="col">Yerine alınan acil iş</th></tr></thead>
   <tbody>
    @for(r of s.returned;track r.id){<tr>
     <td data-label="İş"><strong>{{r.name}}</strong>@if(r.externalId){<small>{{r.externalId}}</small>}</td>
     <td data-label="Planlanan efor">{{fmt(r.hours)}} sa</td>
     <td data-label="Çıkış tarihi">{{day(r.at)}}</td>
     <td data-label="Önceki durum">{{r.previousStatus}}</td>
     <td data-label="Kapsam durumu"><span class="badge mute">Kapsamdan çıkarıldı</span><small>Undone olarak değerlendirilmez</small></td>
     <td data-label="Gerekçe kaydı">@if(r.reason.trim()){{{r.reason}}}@else{<span class="void">Kayıt yok</span>}</td>
     <td data-label="Yerine alınan acil iş">@if(r.replacement){{{r.replacement}}}@else{<span class="void">Kayıt yok</span>}</td>
    </tr>}
    @if(!s.returned.length){<tr><td colspan="7" class="void">Bu sprintte backlog’a döndürülen iş yok.</td></tr>}
   </tbody>
  </table>
 </div>
</section>
}
}

@if(report.unavailableCount){
<h3 class="rpt-sub">Tarihsel Kapsam Verisi Bulunmayan Sprintler</h3>
<p class="rpt-verdict">{{unavailableSummary}}</p>
<div class="rpt-folds">
 <details>
  <summary><span>Etkilenen sprintler</span><small>{{report.unavailableCount}} sprint</small></summary>
  <div class="fold-body"><p>{{report.unavailableNames.join(', ')}}</p></div>
 </details>
</div>
}

<div class="rpt-folds">
 <details>
  <summary><span>Hesaplama Yöntemi</span><small>{{methodology.length}} tanım</small></summary>
  <div class="fold-body"><dl class="scope-terms">@for(m of methodology;track m.term){<dt>{{m.term}}</dt><dd>{{m.text}}</dd>}</dl></div>
 </details>
</div>
}
</section>
`,styleUrls:['./report-design.css'],styles:[`
:host{display:block;margin:20px 0}
.rpt-sub{margin:30px 0 6px;font-size:15px;color:var(--ink)}
.rpt-sub:first-of-type{margin-top:22px}
h4{margin:0 0 6px;font-size:14px;color:var(--ink)}
.scope-head{display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:1px;background:var(--rule);border-block:1px solid var(--rule);margin:16px 0 0}
.scope-head>div{background:#fff;padding:10px 13px;min-width:0}
.scope-head dt{margin:0;font-size:11px;color:var(--slate)}
.scope-head dd{margin:3px 0 0;font-size:13.5px;color:var(--ink);overflow-wrap:anywhere}
.scope-caution{margin:14px 0 0;padding:10px 13px;background:var(--field);border-left:3px solid #8a98a4;font-size:12.5px;line-height:1.6;color:#48596a;max-width:78ch}
.scope-flagged{margin:12px 0 0;padding:9px 12px;background:#f3f0f9;border-left:3px solid var(--support);font-size:12.5px;line-height:1.6;color:#413765;max-width:78ch}
.scope-charts{display:grid;grid-template-columns:minmax(0,238px) minmax(0,1fr);gap:34px;align-items:start}
.scope-findings{margin:12px 0 0;padding-left:18px;font-size:13.5px;line-height:1.8;color:var(--ink);max-width:80ch}
.scope-sprint{padding:22px 0 6px;border-top:1px solid var(--rule)}
.scope-sprint:first-of-type{border-top:0}
.scope-meta{display:flex;flex-wrap:wrap;gap:7px 14px;align-items:center;margin:0 0 10px;font-size:12px;color:var(--slate)}
.table-wrap{margin:16px 0 0;overflow-x:auto}
.table-wrap:focus-visible{outline:2px solid var(--measure);outline-offset:2px}
.scope-table{width:100%;min-width:620px;border-collapse:collapse;font-size:12.5px;font-variant-numeric:tabular-nums}
.scope-table th,.scope-table td{text-align:left;vertical-align:top;padding:9px 10px;border-bottom:1px solid #e4eaee;overflow-wrap:anywhere}
.scope-table th{position:sticky;top:0;z-index:1;background:var(--field);font-size:11px;font-weight:650;color:#48596a;white-space:nowrap}
.scope-table td small{display:block;font-size:11px;color:#8a98a4;margin-top:2px}
.void{color:#8a98a4}
.flag{color:var(--support);font-weight:650}
.badge{display:inline-block;padding:1px 8px;border-radius:9px;font-size:11px;font-weight:620;border:1px solid #c8d1d8;background:#f4f6f8;color:#48596a;white-space:nowrap}
.badge.ok{color:#1f5a46;border-color:#9cc9b8;background:#eef7f3}
.badge.info{color:#1b3f63;border-color:#a8c4da;background:#eef4f9}
.badge.warn{color:#8a5a12;border-color:#dfbd87;background:#fdf6ea}
.badge.bad{color:#8e271f;border-color:#dfa9a3;background:#fcefed}
.scope-terms{margin:0;font-size:12.5px;line-height:1.7}
.scope-terms dt{font-weight:650;margin-top:9px;color:var(--ink)}
.scope-terms dd{margin:1px 0 0;color:#48596a;max-width:84ch}
@media(max-width:900px){.scope-charts{grid-template-columns:minmax(0,1fr);gap:22px}}
.scope-charts>*{min-width:0}
@media print{
 .scope-charts{grid-template-columns:minmax(0,210px) minmax(0,1fr);gap:18px}
 .scope-sprint{break-inside:auto;break-before:page}
 .scope-sprint:first-of-type{break-before:auto}
 .scope-table th{position:static}
 .table-wrap{overflow:visible}
 .scope-table{font-size:9.5px;min-width:0}
 .scope-table th,.scope-table td{padding:5px 6px}
 .scope-table thead{display:table-header-group}
 .scope-table tr,.scope-head{break-inside:avoid}
 .rpt-sub,h4,caption{break-after:avoid}
}
`]})
export class ScopeReportComponent implements OnInit,OnDestroy{
 @Output() readyChange=new EventEmitter<boolean>();
 private api=inject(ApiService);private cdr=inject(ChangeDetectorRef);private destroyed=false;
 rows:Sprint[]=[];selected='';loading=true;error='';
 readonly team=this.api.teamName;
 report:ScopeReport=buildScopeReport([]);
 readonly color=SCOPE_COLORS;
 readonly methodology=METHODOLOGY;
 readonly effortNote=EFFORT_NOTE;
 readonly totalsNote=TOTALS_NOTE;
 readonly unavailableNote=UNAVAILABLE_NOTE;
 readonly reconciliationNote=RECONCILIATION_NOTE;

 ngOnInit(){void this.load();}
 ngOnDestroy(){this.destroyed=true;}

 get visible(){return this.rows.filter(s=>!this.selected||s.id===this.selected);}
 get measured(){return this.report.fullCount+this.report.partialCount;}
 get coverage(){return coverageSentence(this.report);}
 get unavailableSummary(){return unavailableSentence(this.report);}
 get generated(){return stamp(this.report.generatedAt);}
 get filterLabel(){return this.selected?'Tek sprint':this.report.totalSprints+' sprint · takipli '+this.measured;}
 get coverageChart(){return coverageFigure(this.report);}
 get urgentChart(){return urgentFigure(this.report);}
 get movementChart(){return movementFigure(this.report);}
 waterfall(sprint:SprintScope){return waterfallFigure(sprint);}

 fmt=num;
 abs=Math.abs;
 day=shortDate;
 statusOf(sprint:SprintScope){return sprintStatusLabel(sprint.status);}
 trackOf(sprint:SprintScope){return trackingLabel(sprint.tracking);}
 baselineLabel(sprint:SprintScope){return sprint.tracking==='PARTIAL'?'Takip başlangıcı':'Başlangıç planı';}
 tone(status:string){return ({done:'ok',doing:'info',todo:'warn',undone:'bad'} as Record<string,string>)[status]||'mute';}
 urgentLine(sprint:SprintScope){
  let line='Acil / plansız iş: '+items(sprint.urgentCount)+' · '+hours(sprint.urgentHours);
  if(sprint.urgentCompletion!=null)line+=' · tamamlanan '+sprint.urgentDone+'/'+sprint.urgentCount+' (%'+sprint.urgentCompletion+')';
  if(sprint.reserveMoves)line+=' · rezerv içi hareket: '+sprint.reserveMoves;
  return line;
 }

 changed(){this.rebuild();if(!this.destroyed)this.cdr.detectChanges();}
 private rebuild(){this.report=buildScopeReport(this.visible);}

 async load(){
  this.loading=true;this.error='';this.readyChange.emit(false);
  try{this.rows=await this.api.get<Sprint[]>('/reports/scope');this.rebuild();}
  catch(e){this.error=String(e);}
  finally{this.loading=false;if(!this.destroyed)this.readyChange.emit(!this.error);this.changed();}
 }
 print(){if(!this.loading&&!this.error)window.print();}
 download(){if(!this.loading&&!this.error)downloadText(scopeReportHtml(this.visible,new Date(),this.team()),'text/html;charset=utf-8','sprintboard-acil-kapsam.html');}
}
