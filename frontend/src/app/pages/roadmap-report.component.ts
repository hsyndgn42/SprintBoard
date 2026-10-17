import { ListPagerComponent } from '../list-pager.component';
import { ReportHtmlExportComponent } from './report-html-export.component';
import {Component,ChangeDetectorRef,EventEmitter,Output,OnInit,inject} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {RouterLink} from '@angular/router';
import {ApiService,RoadmapItem} from '../api.service';
import {csv,downloadText} from './share-export';
interface RoadmapEffort extends RoadmapItem {
  taskCount:number;done:number;undone:number;open:number;poolCount:number;
  overtimeHours:number;assignedHours:number;doneHours:number;undoneHours:number;openHours:number;poolEstimatedHours:number;
  unassignedTaskCount:number;supportAssignmentCount:number;
}
@Component({standalone:true,selector:'app-roadmap-report',imports:[ListPagerComponent,ReportHtmlExportComponent,FormsModule,RouterLink],template:`
  <section class="card card-pad roadmap-effort-report">
    <div class="section-head"><div><span class="eyebrow">PROJE / FEATURE SET</span><h2>Roadmap efor raporu</h2><p class="data-note">Tüm dönemler · Aktif, planlanan ve tamamlanan sprintler · Güncel Roadmap bağlantıları</p></div><div class="report-actions"><app-report-html-export [disabled]="loading||!!error" [report]="{kind:'roadmap',rows:visible,scope:'Tüm dönemler · '+kindLabel(kind)+' · '+(query||'Tüm referanslar')}" /><button class="btn" [disabled]="loading||!!error||!visible.length" (click)="exportCsv()">Roadmap CSV indir</button></div></div>
    <p class="notice">Atanan efor <strong>planlanan</strong> saattir. Mesai ayrı bir gerçekleşen saat kaydıdır; plan toplamına eklenmez. Mesai, kayıt anındaki Roadmap bağlantısına aittir; eski bağlantısız mesailer dahil değildir.</p>
    <div class="report-filters"><label class="field">Roadmap ara<input [(ngModel)]="query" placeholder="Başlık veya TC / referans ID"></label><label class="field">Tür<select [(ngModel)]="kind"><option value="">Tüm türler</option><option value="PROJECT">Proje</option><option value="FEATURE_SET">Feature set</option><option value="GENERAL">Genel</option><option value="UNSPECIFIED">Tür belirtilmemiş</option></select></label></div>
    <p class="print-only data-note">Roadmap filtresi: {{ kindLabel(kind) }} · {{ query || 'Tüm referanslar' }}. Tüm dönemlerin atanan planlanan saatleri; gerçek harcanan süre değildir.</p>
    @if(loading){<p role="status">Roadmap eforu yükleniyor…</p>}@else if(error){<p class="notice warn" role="alert">{{ error }}</p>}@else if(visible.length){
      <div class="mini-metrics"><div><small>Roadmap öğesi</small><strong>{{ visible.length }}</strong></div><div><small>Toplam atanan efor</small><strong>{{ num(total('assignedHours')) }} sa</strong></div><div><small>Gerçekleşen mesai (ayrı)</small><strong>{{ num(total('overtimeHours')) }} sa</strong></div><div><small>Havuz tahmini (ayrı)</small><strong>{{ num(total('poolEstimatedHours')) }} sa</strong></div></div>

<app-list-pager #roadmapPager [items]="visible" label="Roadmap raporu" />
      <section class="visual-card roadmap-visual" aria-label="Roadmap bazında sonuç durumuna göre planlanan efor">
        <h3>Eforun Roadmap dağılımı</h3><p>Çubukların uzunluğu atanan saatle orantılıdır. Havuz tahminleri ayrı tutulur.</p>
        <div class="visual-legend"><span><i class="v-done"></i>Done</span><span><i class="v-undone"></i>Undone</span><span><i class="v-open"></i>Açık</span></div>
        <div class="visual-rows">@for(row of roadmapPager.rows;track row.id){<article class="visual-row">
          <div class="visual-label"><strong>{{row.title}}</strong><small>{{kindLabel(row.kind)}} · {{row.referenceId || 'Referans ID yok'}}</small></div>
          <div><div class="visual-track" role="img" [attr.aria-label]="row.title+': Done '+num(row.doneHours)+', Undone '+num(row.undoneHours)+', Açık '+num(row.openHours)+' saat'">
            <span class="v-done" [style.width.%]="segment(row.doneHours)"></span><span class="v-undone" [style.width.%]="segment(row.undoneHours)"></span><span class="v-open" [style.width.%]="segment(row.openHours)"></span>
          </div><div class="visual-values"><strong>{{num(row.assignedHours)}} sa toplam</strong><span>{{num(row.doneHours)}} Done</span><span>{{num(row.undoneHours)}} Undone</span><span>{{num(row.openHours)}} açık</span><span>Havuz: {{num(row.poolEstimatedHours)}} sa (ayrı)</span></div></div>
        </article>}</div>
      </section>
      <section class="visual-card"><h3>Roadmap bazlı gerçekleşen mesai</h3><p>Planlanan efordan ayrı · Göreve bağlı onaylı/doğrudan mesai kayıtları</p><div class="visual-rows">@for(row of roadmapPager.rows;track row.id){<article class="visual-row"><strong>{{row.title}}</strong><div><div class="visual-track"><span class="v-open" [style.width.%]="overtimeSegment(row.overtimeHours)"></span></div><strong>{{num(row.overtimeHours)}} sa mesai</strong></div></article>}</div></section>
      <div class="table-wrap"><table><thead><tr><th>Roadmap</th><th>Sprint işleri</th><th>Atanan efor</th><th>Mesai (ayrı)</th><th>Done / Undone / Açık efor</th><th>Havuz tahmini</th></tr></thead><tbody>
        @for(row of roadmapPager.rows;track row.id){<tr><td><a [routerLink]="['/roadmap',row.id]"><strong>{{ row.title }}</strong></a><small>{{ kindLabel(row.kind) }} · {{ row.referenceId || 'Referans ID yok' }}</small></td>
          <td>{{ row.taskCount }} iş<small>{{ row.done }} Done · {{ row.undone }} Undone · {{ row.open }} açık</small></td>
          <td><strong>{{ num(row.assignedHours) }} sa</strong><div class="report-bar"><span [style.width.%]="volume(row)"></span></div><small>{{ row.supportAssignmentCount }} X atama · {{ row.unassignedTaskCount }} atamasız iş</small></td>
          <td>{{ num(row.overtimeHours) }} sa</td><td>{{ num(row.doneHours) }} / {{ num(row.undoneHours) }} / {{ num(row.openHours) }} sa</td><td>{{ num(row.poolEstimatedHours) }} sa<small>{{ row.poolCount }} sprint dışı iş</small></td></tr>}
      </tbody></table></div>
    }@else{<div class="empty"><strong>Bu kapsamda Roadmap öğesi yok</strong>Roadmap oluşturup backlog işlerini bağladığınızda efor burada görünür.</div>}
    <p class="data-note">Bir görev bir kez, çoklu atamalarda her kişinin saati ayrı toplanır. Tekrar/taşıma işleri kendi sprint atamalarıyla sayılır. X destek ve Leave saat toplamına girmez; diğer BAU dahildir. Atamasız görevler 0 atanan saat gösterir, görev tahmini yerine kullanılmaz. Kapalı sprintlerde varsa sabit kapanış atamaları kullanılır. Bağlantısız işler bu rapora dahil değildir.</p>
  </section>
`,styleUrls:['./report-visuals.css'],styles:[`:host{display:block;margin:20px 0}.mini-metrics{margin:18px 0;grid-template-columns:repeat(4,minmax(0,1fr))}.notice strong{display:inline}@media(max-width:800px){.mini-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}th:first-child{width:27%}td{overflow-wrap:anywhere}td small{display:block} .report-bar{margin-top:8px}@media print{.report-filters,button{display:none}.table-wrap{overflow:visible}table{table-layout:fixed;width:100%;min-width:0;font-size:9px}th,td{padding:7px}tr{break-inside:avoid}.mini-metrics{break-inside:avoid}}`]})
export class RoadmapReportComponent implements OnInit {
  @Output() readyChange=new EventEmitter<boolean>();
  private api=inject(ApiService);private cdr=inject(ChangeDetectorRef);
  rows:RoadmapEffort[]=[];loading=true;error='';query='';kind='';
  kindLabel(value:string){return ({PROJECT:'Proje',FEATURE_SET:'Feature set',GENERAL:'Genel',UNSPECIFIED:'Tür belirtilmemiş'} as Record<string,string>)[value]||'Tüm türler';}
  num(value:number){return new Intl.NumberFormat('tr-TR',{maximumFractionDigits:2}).format(value);}
  get visible(){const q=this.query.trim().toLocaleLowerCase('tr-TR');return this.rows.filter(r=>(!this.kind||r.kind===this.kind)&&(!q||(r.title+' '+(r.referenceId||'')).toLocaleLowerCase('tr-TR').includes(q))).sort((a,b)=>b.assignedHours-a.assignedHours);}
  total(key:'assignedHours'|'doneHours'|'poolEstimatedHours'|'overtimeHours'){return this.visible.reduce((sum,row)=>sum+row[key],0);}
  segment(hours:number){return 100*Math.max(0,hours)/Math.max(1,...this.visible.map(r=>r.assignedHours));}
  overtimeSegment(hours:number){return 100*Math.max(0,hours)/Math.max(1,...this.visible.map(r=>r.overtimeHours));}
  volume(row:RoadmapEffort){return 100*row.assignedHours/Math.max(1,...this.visible.map(r=>r.assignedHours));}
  async ngOnInit(){this.readyChange.emit(false);try{this.rows=await this.api.get<RoadmapEffort[]>('/reports/roadmap');}catch(e){this.error=String(e);}finally{this.loading=false;this.cdr.detectChanges();this.readyChange.emit(!this.error);}}
  exportCsv(){if(this.loading||this.error)return;downloadText(csv([['Kapsam','Tür','Referans ID','Roadmap','Sprint işleri','Done','Undone','Açık','Atanan planlanan saat','Gerçekleşen mesai saat (ayrı)','Done atanan saat','Undone atanan saat','Açık atanan saat','Havuz iş','Havuz tahmini saat','X atama','Atamasız iş'],...this.visible.map(r=>['Tüm dönemler; gerçek harcanan süre değildir',this.kindLabel(r.kind),r.referenceId,r.title,r.taskCount,r.done,r.undone,r.open,r.assignedHours,r.overtimeHours,r.doneHours,r.undoneHours,r.openHours,r.poolCount,r.poolEstimatedHours,r.supportAssignmentCount,r.unassignedTaskCount])]),'text/csv;charset=utf-8','sprintboard-roadmap-efor.csv');}
}
