import {Component,OnInit,OnDestroy,Output,EventEmitter,inject,ChangeDetectorRef} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ApiService,Sprint} from '../api.service';
import {ScopeSummaryComponent} from './scope-summary.component';
import {scopeReportHtml,buildScope} from './scope-summary.model';
import {SbDumbbellComponent,SbFlowComponent,Dumbbell,Step} from './report-charts';
import {downloadText} from './share-export';

/**
 * One question: did the plan hold? Across sprints that reads as growth, so the chart compares
 * the opening plan with what was added afterwards. Inside one sprint it reads as a sequence of
 * moves, so the chart becomes a flow. The reasons people typed stay in the per-sprint detail.
 */
@Component({selector:'app-scope-report',standalone:true,imports:[FormsModule,ScopeSummaryComponent,SbDumbbellComponent,SbFlowComponent],template:`
<section class="card card-pad scope-report">

<div class="rpt-head"><h2>Acil işler ve kapsam değişimi</h2><div class="rpt-actions"><button class="btn" [disabled]="loading||!!error" (click)="download()">HTML indir</button></div></div>
@if(!loading&&!error){<p class="rpt-verdict" [innerHTML]="verdict"></p>}

<div class="rpt-filters"><label class="field">Sprint<select [(ngModel)]="selected" (ngModelChange)="changed()"><option value="">Tüm sprintler</option>@for(s of rows;track s.id){<option [value]="s.id">{{s.name}}</option>}</select></label></div>

@if(loading){<p class="rpt-empty" role="status">Kapsam geçmişi yükleniyor…</p>}
@else if(error){<p class="notice warn" role="alert">{{error}} <button class="btn small" (click)="load()">Tekrar dene</button></p>}
@else if(!tracked.length){<p class="rpt-empty">Bu kapsamda kapsam takibi yapılan sprint yok. Takip başlamadan önceki değişiklikler bilinmiyor; sıfır değişim olarak okunmamalı.</p>}
@else{

<dl class="rpt-kpis">
<div><dt>Başlangıç planı</dt><dd>{{fmt(total('baselineHours'))}}<small>sa</small></dd></div>
<div><dt>Sonradan eklenen</dt><dd [class.over]="total('addedHours')>0">+{{fmt(total('addedHours'))}}<small>sa</small></dd></div>
<div><dt>Backlog’a dönen</dt><dd>−{{fmt(total('removedHours'))}}<small>sa</small></dd></div>
<div><dt>Acil / plansız</dt><dd [class.over]="emergencyCount>0">{{emergencyCount}}<small>iş</small></dd></div>
</dl>

@if(one){
<div class="rpt-figure"><sb-flow [steps]="flow" unit="sa" [label]="one.name+' kapsamının açılıştan bugüne akışı'" /></div>
<div class="rpt-key"><span><i style="background:#1f6f78"></i>Başlangıç planı</span><span><i style="background:#c0362c"></i>Eklenen</span><span><i style="background:#b9c4cb"></i>Çıkarılan</span><span><i style="background:#15202b"></i>Güncel kapsam</span></div>
}@else{
<div class="rpt-figure"><sb-dumbbell [rows]="moves" unit="sa" label="Sprintlerin açılış planı ile güncel kapsamı arasındaki mesafe" fromColor="#1f6f78" toColor="#c0362c" /></div>
<div class="rpt-key"><span><i style="background:#1f6f78"></i>Açılış planı</span><span><i style="background:#c0362c"></i>Güncel kapsam</span><span>Sağdaki rakam: güncel / açılış (sa)</span></div>
}

<h3 class="rpt-sub">Sprint sprint gerekçeler</h3>
<p class="rpt-aside">Acil işlerin kimin kararıyla ve hangi gerekçeyle girdiği her sprintin kendi kaydında duruyor.</p>
}
</section>
@for(s of visible;track s.id){<app-scope-summary [sprint]="s" />}
`,styleUrls:['./report-design.css'],styles:[`:host{display:block;margin:20px 0}.rpt-sub{margin:32px 0 4px;font-size:15px;color:#15202b}`]})
export class ScopeReportComponent implements OnInit,OnDestroy{
 @Output() readyChange=new EventEmitter<boolean>();private api=inject(ApiService);private cdr=inject(ChangeDetectorRef);private destroyed=false;
 rows:Sprint[]=[];selected='';loading=true;error='';
 ngOnInit(){void this.load();}ngOnDestroy(){this.destroyed=true;}
 get visible(){return this.rows.filter(s=>!this.selected||s.id===this.selected);}
 /** A sprint without flow history has no measurable scope change and would read as a flat zero. */
 get tracked(){return this.visible.filter(s=>buildScope(s).tracked);}
 get one(){return this.selected&&this.tracked.length===1?this.tracked[0]:null;}
 changed(){if(!this.destroyed)this.cdr.detectChanges();}
 fmt(n:number){return new Intl.NumberFormat('tr-TR',{maximumFractionDigits:1}).format(n);}
 total(key:'baselineHours'|'addedHours'|'removedHours'|'currentHours'|'emergencyHours'){return this.tracked.reduce((n,s)=>n+buildScope(s)[key],0);}
 get emergencyCount(){return this.tracked.reduce((n,s)=>n+buildScope(s).emergencies.length,0);}

 /** The distance between the two dots is the scope change; the colour says which way it went. */
 get moves():Dumbbell[]{return this.tracked.slice(-12).map(s=>{const m=buildScope(s);return {key:s.id,label:s.name,
  note:(m.addedHours>0?'+'+this.fmt(m.addedHours)+' sa eklendi':'ekleme yok')+(m.removedHours>0?' · −'+this.fmt(m.removedHours)+' sa çıktı':''),
  from:m.baselineHours,to:m.currentHours,
  caption:s.name+': açılış '+this.fmt(m.baselineHours)+' sa, eklenen '+this.fmt(m.addedHours)+' sa, çıkarılan '+this.fmt(m.removedHours)+' sa, güncel '+this.fmt(m.currentHours)+' sa'};});}
 get flow():Step[]{const s=this.one;if(!s)return [];const m=buildScope(s);
  return [{label:'Açılış planı',value:m.baselineHours,kind:'base'},{label:'Eklenen',value:m.addedHours,kind:'add'},{label:'Çıkarılan',value:m.removedHours,kind:'remove'},{label:'Güncel kapsam',value:m.currentHours,kind:'total'}];}

 get verdict(){
  const n=this.tracked.length;
  if(!n)return 'Seçili kapsamda kapsam takibi yapılan sprint yok.';
  const base=this.total('baselineHours'),added=this.total('addedHours'),removed=this.total('removedHours'),urgent=this.emergencyCount,urgentHours=this.total('emergencyHours');
  const span=n===1?this.esc(this.tracked[0].name)+' sprintinde':'Takibi yapılan '+n+' sprintte';
  if(base<=0&&added<=0)return span+' kayıtlı kapsam hareketi yok.';
  const growth=base>0?Math.round(added/base*1000)/10:null;
  let text=span+' açılış planı <b>'+this.fmt(base)+' saatti</b>; üstüne ';
  text+=added>0?'<b class="over">'+this.fmt(added)+' saat</b> iş eklendi':'iş eklenmedi';
  text+=removed>0?', <b>'+this.fmt(removed)+' saat</b> backlog\u2019a döndü.':'.';
  if(growth!==null&&added>0)text+=' Plan <b class="over">%'+this.fmt(growth)+'</b> büyüdü.';
  if(urgent>0)text+=' Bunun '+urgent+' tanesi acil geldi ('+this.fmt(urgentHours)+' sa).';
  else text+=' Acil iş girmedi.';
  return text;
 }
 private esc(value:string){return value.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!));}

 async load(){this.loading=true;this.error='';this.readyChange.emit(false);try{this.rows=await this.api.get<Sprint[]>('/reports/scope');}catch(e){this.error=String(e);}finally{this.loading=false;if(!this.destroyed)this.readyChange.emit(!this.error);this.changed();}}
 download(){if(!this.loading&&!this.error)downloadText(scopeReportHtml(this.visible),'text/html;charset=utf-8','sprintboard-acil-kapsam.html');}
}
