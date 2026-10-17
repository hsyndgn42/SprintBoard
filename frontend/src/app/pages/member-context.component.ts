import { ListPagerComponent } from '../list-pager.component';
import { ReportHtmlExportComponent } from './report-html-export.component';
import {Component,Input} from '@angular/core';
import {RouterLink} from '@angular/router';
import {MemberReportRow} from '../api.service';
import {memberContexts,capacitySourceLabel} from './member-context.model';
@Component({selector:'app-member-context',standalone:true,imports:[ListPagerComponent,ReportHtmlExportComponent,RouterLink],template:`
<div class="section-head"><span class="data-note">HTML kişi bilgisi, izin günü ve kapasite ayrıntıları içerir.</span><app-report-html-export [disabled]="loading" [report]="{kind:'context',rows:rows,scope:scope}" /></div><div class="member-context-heading"><span class="eyebrow">KATILIM BAĞLAMI</span><h3>Kapasite, izin ve X destek</h3>
<p class="data-note">Dönem ve kişi filtreleri Kişi dağılımı sekmesiyle ortaktır. İzin iş adedine/efora eklenmez; X, saat tahmini verilmemiş destek atamasıdır. Yük oranı gerçekleşen çalışma veya performans puanı değildir.</p></div>

<app-list-pager #personPager [items]="summaries" label="Katılım raporu" />
@if(summaries.length){
<section class="visual-card context-visual" aria-label="Kişi bazında kapasite, efor, izin ve X destek karşılaştırması">
<h3>Kapasite ve katkı haritası</h3><p>Saatler aynı ölçekte karşılaştırılır. İzin günleri ve X destek adedi ayrı gösterilir; efora eklenmez.</p>
<div class="visual-legend"><span><i class="v-capacity"></i>Net kapasite (saat)</span><span><i class="v-core"></i>Planlanan efor (saat)</span></div>
<div class="visual-rows">@for(m of personPager.rows;track m.id){
<article class="visual-row"><div class="visual-label"><strong>{{m.name}}</strong><small>{{m.total}} sprint · {{m.known}} kapasite kaydı</small></div>
<div><div class="visual-pair"><span>Kapasite</span><div class="visual-track"><span class="v-capacity" [style.width.%]="chartWidth(m.availableHours)"></span></div><strong>{{m.known?n(m.availableHours)+' sa':'—'}}</strong></div>
<div class="visual-pair"><span>Plan</span><div class="visual-track"><span class="v-core" [style.width.%]="chartWidth(m.effortHours)"></span></div><strong>{{n(m.effortHours)}} sa</strong></div>
<div class="context-markers"><span>{{n(m.leaveDays)}} gün izin</span><span>{{m.supportTasks}} X destek ataması</span>@if(m.known<m.total){<span>Kapasite eksik; oran hesaplanmaz</span>}@else if(m.load!==null){<span>Plan / kapasite %{{n(m.load)}}</span>}</div>
</div></article>
}</div></section>}
<div class="member-context-list">@for(m of personPager.rows;track m.id){<details class="member-context"><summary><span><strong>{{ m.name }}</strong><small>{{ m.total }} sprint · {{ m.frozen }} kapanış kaydı · {{ m.recalculated }} yeniden hesaplanan</small></span><span class="context-pills"><b>{{ n(m.leaveDays) }} gün izin</b><b>{{ m.supportTasks }} X destek</b></span></summary>
<div class="context-overview"><div><small>AYRILAN GÜN</small><strong>{{ m.known?n(m.allocatedDays):'—' }}</strong></div><div><small>NET KAPASİTE</small><strong>{{ m.known?n(m.availableHours)+' sa':'—' }}</strong></div><div><small>PLANLANAN EFOR</small><strong>{{ n(m.effortHours) }} sa</strong></div><div><small>PLAN / KAPASİTE</small><strong>{{ m.load===null?'—':n(m.load)+'%' }}</strong></div></div>
@if(m.known<m.total){<p class="context-warning">Kapasite {{ m.known }} / {{ m.total }} sprintte hesaplanabiliyor. Gün ve kapasite toplamı yalnız bu sprintleri içerir; birleşik yük oranı üretilmez.</p>}
@if(m.recalculated){<p class="data-note">Kapanış kaydı olmayan dönemler mevcut takım, takvim ve izin kayıtlarıyla yeniden hesaplanır; kesin tarihsel kapasite değildir.</p>}
@if(m.load!==null){<div class="context-load" role="img" [attr.aria-label]="'Planlanan efor / net kapasite yüzde '+n(m.load)"><span [style.width.%]="width(m.load)" [class.over]="m.load>100"></span></div>}
<app-list-pager #periodPager [items]="m.periods" label="Kişi sprintleri" /><div class="member-periods">@for(p of periodPager.rows;track p.sprintId){<article class="member-period"><header><a [routerLink]="['/sprints',p.sprintId,'capacity']">{{ p.sprintName }}</a><span>{{ sourceLabel(p.capacitySource) }}</span></header>
<div class="period-values"><span>Ayrılan <b>{{ p.allocatedDays===null?'—':n(p.allocatedDays)+' gün' }}</b><small>{{ p.allocationExplicit?'Sprint için girilen':p.capacitySource==='FROZEN'?'Kapanışta kayıtlı':'Varsayılan / belirsiz' }}</small></span>
<span>İzin <b>{{ n(p.leaveDays) }} gün</b></span><span>Net kapasite <b>{{ p.availableHours===null?'—':n(p.availableHours)+' sa' }}</b></span><span>Planlanan efor <b>{{ n(p.effortHours) }} sa</b></span><span>X destek <b>{{ p.supportTaskCount }} iş</b></span></div>
<p class="data-note">Çalışılmayan: {{ p.nonWorkingDays===null?'—':n(p.nonWorkingDays)+' gün' }} · Kapasiteye eklenen planlı mesai: {{ p.overtimeHours===null?'—':n(p.overtimeHours)+' sa' }}@if(p.unestimatedTaskCount){ · {{ p.unestimatedTaskCount }} işte saat eforu girilmemiş (X değil)}</p>
</article>}</div></details>}@empty{<p class="empty">Seçili filtrelerde katılım kaydı bulunamadı.</p>}</div>
`,styleUrls:['./report-visuals.css'],styles:[`
:host{display:block;min-width:0}
.member-context-heading{margin-top:4px}.member-context-list{display:grid;gap:12px;margin-top:16px}.member-context{border:1px solid #dfe7f2;border-radius:12px;padding:16px 18px;background:#fafcff;min-width:0}.member-context summary{cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:12px;list-style:none}.member-context summary:before{content:'›';font-size:22px;color:#2367ae}.member-context[open] summary:before{content:'⌄'}.member-context summary>span:first-of-type{flex:1}.member-context summary strong,.member-context summary small{display:block}.member-context summary small{font-size:11px;color:#70839b;margin-top:4px}.context-pills{display:flex;gap:6px;flex-wrap:wrap}.context-pills b{font-size:11px;border-radius:6px;padding:5px 8px;background:#edf3fa;color:#294d75}.context-overview{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0}.context-overview small{font-size:10px;color:#698099;display:block}.context-overview strong{font-size:20px;display:block;margin-top:5px}.context-warning{color:#8c5c20;font-size:12px;background:#fff8e9;padding:10px;border-radius:8px}.context-load{height:8px;background:#e6edf7;border-radius:6px;overflow:hidden;margin:12px 0}.context-load span{display:block;height:100%;background:#2672c4}.context-load .over{background:#bd7e25}.member-periods{display:grid;gap:10px}.member-period{padding:14px;background:white;border:1px solid #e0e8f2;border-radius:9px;break-inside:avoid}.member-period header{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;font-size:12px}.member-period header span{color:#75859a}.period-values{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:12px 0;font-size:11px;color:#526a83}.period-values b,.period-values small{display:block}.period-values b{font-size:14px;color:#213e5d;margin-top:3px}.period-values small{font-size:10px;margin-top:4px}.member-period .data-note{font-size:11px}
@media(max-width:650px){.context-overview,.period-values{grid-template-columns:1fr 1fr}.member-context summary{flex-wrap:wrap}.context-pills{flex-basis:100%}.member-context{padding:13px}.member-period header{display:block}.member-period header span{display:block;margin-top:4px}}
@media print{.member-context{break-inside:avoid}.member-context::details-content{content-visibility:visible;height:auto}.member-context>:not(summary){display:block}.context-overview,.period-values{display:grid!important}.member-periods{display:grid!important}.context-load{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`]})
export class MemberContextComponent {
 @Input() scope='Tüm tamamlanan sprintler';@Input() loading=false;
 @Input({required:true}) rows:MemberReportRow[]=[];
 get summaries(){return memberContexts(this.rows);}
 chartWidth(value:number){return 100*Math.max(0,value)/Math.max(1,...this.summaries.flatMap(m=>[m.availableHours,m.effortHours]));}
 sourceLabel=capacitySourceLabel;
 n(value:number){return new Intl.NumberFormat('tr-TR',{maximumFractionDigits:1}).format(value);}
 width(value:number){return Math.min(100,Math.max(0,value));}
}
