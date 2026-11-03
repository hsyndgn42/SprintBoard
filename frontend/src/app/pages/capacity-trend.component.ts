import { ReportHtmlExportComponent } from './report-html-export.component';
import { SbColumnsComponent,Column } from './report-charts';
import { Component,Input,Output,EventEmitter,OnChanges,AfterViewInit,ChangeDetectorRef,inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { MemberReportRow,ReportRow } from '../api.service';
import { buildCapacityTrend,CapacityTrend,trendSource,trendCsvRows } from './capacity-trend.model';
import { csv,downloadText } from './share-export';

/**
 * One question: did the plan fit the team? The verdict answers it in words, the figure
 * shows the shape of it, and the sprint-by-sprint numbers stay folded until asked for.
 * Overload and idle capacity are drawn on opposite sides of a zero line because they are
 * counted per person and can both be true in the same sprint.
 */
@Component({selector:'app-capacity-trend',standalone:true,imports:[ReportHtmlExportComponent,FormsModule,SbColumnsComponent],template:`
<section class="card card-pad capacity-trend">

<div class="rpt-head"><h2>Kapasite ve plan</h2><div class="rpt-actions"><app-report-html-export [report]="{kind:'capacity',rows:rows,scope:scope}" /><button class="btn" (click)="exportCsv()" [disabled]="!rows.length">CSV indir</button></div></div>
<p class="rpt-verdict" [innerHTML]="verdict"></p>
@if(split){<p class="rpt-aside">Bir kişinin boş kalan saati başka birinin kapasite üstü planını kapatmaz, bu yüzden ikisi birlikte görünür.</p>}

<div class="rpt-filters">
<label class="field">Sprint aralığı<select name="trendLimit" [(ngModel)]="limit" (ngModelChange)="refresh()"><option [ngValue]="6">Son 6 tamamlanan</option><option [ngValue]="12">Son 12 tamamlanan</option><option [ngValue]="0">Tüm tamamlananlar</option></select></label>
<label class="field">Kişi<select name="trendMember" [(ngModel)]="memberId" (ngModelChange)="refresh()"><option value="">Kayıtlı tüm kişiler</option>@for(p of people;track p.id){<option [value]="p.id">{{p.name}}</option>}</select></label>
<label class="field">Kapasite kaynağı<select name="trendSource" [(ngModel)]="source" (ngModelChange)="refresh()"><option value="">Tüm kaynaklar</option><option value="FROZEN">Yalnız sabit kapanış</option><option value="RECALCULATED">Yalnız yeniden hesaplanan</option></select></label>
</div>

@if(!rows.length){<p class="rpt-empty">Bu kapsamda tamamlanan sprint yok. Bir sprint kapandığında kapasite karşılaştırması burada oluşur.</p>}@else{

<dl class="rpt-kpis">
<div [class.muted]="loadRatio===null"><dt>Çekirdek plan / kapasite</dt><dd [class.over]="loadRatio!==null&&loadRatio>100">{{loadRatio===null?'—':'%'+fmt(loadRatio)}}</dd></div>
<div><dt>Kişi bazında aşım</dt><dd [class.over]="total('over')>0">{{fmt(total('over'))}}<small>sa</small></dd></div>
<div><dt>Atanmamış kapasite</dt><dd>{{fmt(total('free'))}}<small>sa</small></dd></div>
<div><dt>Support planı</dt><dd>{{fmt(total('supportPlanned'))}}<small>sa</small></dd></div>
</dl>

<div class="rpt-figure">
<sb-columns [columns]="columns" unit="sa" [average]="averagePlan" averageLabel="ortalama plan" [label]="chartLabel" />
</div>
<div class="rpt-key"><span><i class="f-measure"></i>Çekirdek planı</span><span><i class="f-support"></i>Support planı</span><span><i class="rule"></i>O sprintin kapasitesi</span><span><i class="dash"></i>Ortalama plan</span></div>

<div class="rpt-figure gaps">
<svg [attr.viewBox]="'0 0 '+width+' 120'" role="img" aria-label="Sıfır çizgisinin üstünde kişisel kapasite aşımı, altında atanmamış kapasite">
 <line class="zero" [attr.x1]="56" [attr.x2]="width-14" y1="56" y2="56"/>
 <text x="48" y="42" text-anchor="end">aşım</text><text x="48" y="72" text-anchor="end">boşta</text>
 @for(r of rows;track r.id;let i=$index){<g>
  <title>{{r.name}}: {{fmt(r.over)}} sa kapasite üstü plan, {{fmt(r.free)}} sa atanmamış kapasite</title>
  @if(r.over>0){<rect class="f-over" [attr.x]="x(i)-bar/3" [attr.y]="56-gap(r.over)" [attr.width]="bar*2/3" [attr.height]="gap(r.over)"/>}
  @if(r.free>0){<rect class="f-spare" [attr.x]="x(i)-bar/3" y="56" [attr.width]="bar*2/3" [attr.height]="gap(r.free)"/>}
 </g>}
 @for(r of rows;track r.id;let i=$index){@if(i%step===0||i===rows.length-1){<text [attr.x]="x(i)" y="110" text-anchor="middle">S{{r.number}}</text>}}
</svg>
</div>
<div class="rpt-key"><span><i class="f-over"></i>Kişisel aşım</span><span><i class="f-spare"></i>Atanmamış kapasite</span></div>

<div class="rpt-folds">
<details><summary><span>Sprint sprint rakamlar</span><small>{{rows.length}} sprint</small></summary><div class="fold-body"><div class="table-wrap"><table>
<thead><tr><th scope="col">Sprint</th><th scope="col">Kapasite</th><th scope="col">Çekirdek planı</th><th scope="col">Support</th><th scope="col">Oran</th><th scope="col">Aşım</th><th scope="col">Boşta</th><th scope="col">Kaynak</th></tr></thead>
<tbody>@for(r of rows;track r.id){<tr>
 <td>{{r.name}}</td>
 <td>{{r.people&&!r.unknown&&r.known?fmt(r.capacity)+' sa':'—'}}</td>
 <td>{{fmt(r.corePlanned)}} sa</td><td>{{fmt(r.supportPlanned)}} sa</td>
 <td>{{r.coreRatio===null?'—':'%'+fmt(r.coreRatio)}}</td>
 <td>{{r.known?fmt(r.over)+' sa':'—'}}</td><td>{{r.known?fmt(r.free)+' sa':'—'}}</td>
 <td>{{sourceLabel(r)}}@if(r.unknown){<small>{{r.unknown}} kişinin kapasitesi bilinmiyor</small>}</td>
</tr>}</tbody></table></div></div></details>

<details><summary><span>Nasıl hesaplanıyor?</span></summary><div class="fold-body">
<p>Kapasite yalnız çekirdek ekibindir. Support ve Architect kapasiteye eklenmez ama saatli atamaları toplam plana girer, bu yüzden ayrı renkte gösterilir.</p>
<p>Aşım ve boşluk her kişi için ayrı hesaplanıp toplanır. Ekip toplamını karşılaştırmak birinin boşluğunu diğerinin açığıyla götürürdü; bu rapor onu yapmaz.</p>
<p>İzin, çalışılmayan gün, odak oranı ve plana dahil edilmiş mesai kapasitenin içindedir. BAU eforu plana dahildir; Leave ve X destek saat toplamaz. Gösterilen rakam planlanan saattir, gerçekleşen süre değildir.</p>
<p>%100 üstü planlama bir hata değildir: ek destek ya da fazla mesai kararı olabilir. Bu oran tek başına performans ölçmez.</p>
<p><b>Sabit kapanış</b> sprint kapanırken saklanan planı, <b>yeniden hesaplanan</b> güncel kayıtlardan üretilen tarihsel kapasiteyi gösterir. Çekirdek kapasitesi eksik olan sprintte oran üretilmez ve kapasite çizgisi çizilmez; sıfır kapasite varsayılmaz. Rapor yalnız iş, izin veya sabit kapanış kaydıyla görünen kişileri kapsar; tüm ekibin tarihsel katılımını kanıtlamaz.</p>
<p>Çevrim süresi henüz ölçülmüyor. Güvenilir hesap için işe başlama, tamamlanma ve yeniden açılma olaylarının kalıcı tutulması gerekiyor; eksik geçmişe süre atanmaz.</p>
</div></details>
</div>
}
</section>`,styleUrls:['./report-design.css'],styles:[`:host{display:block;margin:20px 0;min-width:0}.capacity-trend td small{display:block;color:#5a6b7b;font-size:11px}`]})
export class CapacityTrendComponent implements OnChanges,AfterViewInit{
 @Input()members:MemberReportRow[]=[];@Input()sprints:ReportRow[]=[];@Output()readyChange=new EventEmitter<boolean>();
 private cdr=inject(ChangeDetectorRef);memberId='';source='';limit=6;rows:CapacityTrend[]=[];people:{id:string;name:string}[]=[];sourceLabel=trendSource;
 ngOnChanges(){const names=new Map<string,string>();for(const r of this.members)names.set(r.memberId,r.memberName);this.people=[...names].map(([id,name])=>({id,name})).sort((a,b)=>a.name.localeCompare(b.name,'tr'));this.rebuild();}
 ngAfterViewInit(){queueMicrotask(()=>this.readyChange.emit(true));}
 rebuild(){this.rows=buildCapacityTrend(this.sprints,this.members,{memberId:this.memberId,source:this.source,limit:this.limit});}
 refresh(){this.rebuild();this.cdr.detectChanges();}
 get scope(){return (this.limit?'Son '+this.limit+' tamamlanan sprint':'Tüm tamamlanan sprintler')+' · '+(this.people.find(p=>p.id===this.memberId)?.name||'Kayıtlı tüm kişiler')+' · '+(this.source==='FROZEN'?'Sabit kapanış':this.source==='RECALCULATED'?'Yeniden hesaplanan':'Tüm kaynaklar');}
 total(key:'capacity'|'planned'|'corePlanned'|'supportPlanned'|'over'|'free'){return this.rows.reduce((sum,r)=>sum+r[key],0);}

 /** Only sprints with a complete core capacity can carry a ratio, so the rest are left out of both sides. */
 private get comparable(){return this.rows.filter(r=>r.known&&!r.unknown&&r.capacity>0);}
 get loadRatio(){const c=this.comparable;if(!c.length)return null;const capacity=c.reduce((n,r)=>n+r.capacity,0);return Math.round(c.reduce((n,r)=>n+r.corePlanned,0)/capacity*1000)/10;}
 get busiest(){return this.comparable.reduce<CapacityTrend|null>((top,r)=>top===null||(r.coreRatio??0)>(top.coreRatio??0)?r:top,null);}
 get split(){return this.total('over')>0&&this.total('free')>0;}

 get verdict(){
  const n=this.rows.length,ratio=this.loadRatio,over=this.total('over'),free=this.total('free');
  const who=this.people.find(p=>p.id===this.memberId)?.name;
  const span=who?this.esc(who)+' için son '+n+' sprintte':'Son '+n+' sprintte';
  if(ratio===null)return span+' karşılaştırılabilir çekirdek kapasite kaydı yok, bu yüzden doluluk oranı üretilmedi. Planlanan saatler aşağıda görünür.';
  const peak=this.busiest;
  let text=span+' çekirdek ekibe kapasitenin <b'+(ratio>100?' class="over"':'')+'>%'+this.fmt(ratio)+'</b>\u2019i kadar iş planlandı.';
  if(peak&&n>1&&peak.coreRatio!==null)text+=' En yüklü sprint '+this.esc(peak.name)+' (%'+this.fmt(peak.coreRatio)+').';
  if(over>0&&free>0)text+=' Kişi bazında <b class="over">'+this.fmt(over)+' saat</b> kapasite üstü plan ve <b>'+this.fmt(free)+' saat</b> atanmamış kapasite var.';
  else if(over>0)text+=' Kişi bazında <b class="over">'+this.fmt(over)+' saat</b> kapasite üstü plan var.';
  else if(free>0)text+=' Kimse kapasitesini aşmadı; <b>'+this.fmt(free)+' saat</b> atanmamış kapasite kaldı.';
  else text+=' Plan kapasiteye tam oturdu.';
  return text;
 }
 private esc(value:string){return value.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!));}

 get chartLabel(){return 'Sprintlere göre çekirdek ve Support planı, her sprintin kendi kapasite çizgisi ve ortalama plan';}
 get columns():Column[]{return this.rows.map(r=>({key:r.id,label:'S'+r.number,caption:this.caption(r),empty:r.people?undefined:'kayıt yok',
  marker:r.known&&!r.unknown?r.capacity:null,
  segments:[{label:'Çekirdek planı',value:r.corePlanned,fill:'#1f6f78'},{label:'Support planı',value:r.supportPlanned,fill:'#6b5ca5'}]}));}
 /** The average ignores sprints with no comparable record so an empty sprint cannot drag it down. */
 get averagePlan(){const c=this.rows.filter(r=>r.people);return c.length?c.reduce((n,r)=>n+r.planned,0)/c.length:null;}
 caption(r:CapacityTrend){return r.people?r.name+': çekirdek planı '+this.fmt(r.corePlanned)+' sa, Support '+this.fmt(r.supportPlanned)+' sa, kapasite '+(r.known&&!r.unknown?this.fmt(r.capacity)+' sa':'eksik'):r.name+': karşılaştırılabilir kayıt yok';}

 get width(){return Math.max(720,88+this.rows.length*58);}
 get bar(){return Math.max(9,Math.min(44,(this.width-70)/Math.max(1,this.rows.length)-14));}
 get step(){return Math.max(1,Math.ceil(this.rows.length/14));}
 private get spread(){return Math.max(1,...this.rows.flatMap(r=>[r.over,r.free]));}
 x(i:number){return 56+(i+0.5)*(this.width-70)/Math.max(1,this.rows.length);}
 gap(value:number){return 40*Math.max(0,value)/this.spread;}
 fmt(n:number){return new Intl.NumberFormat('tr-TR',{maximumFractionDigits:1}).format(n);}
 exportCsv(){downloadText(csv(trendCsvRows(this.rows,this.scope)),'text/csv;charset=utf-8','sprintboard-kapasite-trendi.csv');}
}
