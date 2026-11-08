import { ReportHtmlExportComponent } from './report-html-export.component';
import { SbDonutComponent,SbPairComponent,Dumbbell,Slice } from './report-charts';
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

/**
 * One question: where is the effort going, and how much of it landed? The ranking answers
 * both at once, and the dashed line marks the roadmap item of ordinary size so an outlier
 * is visible without reading a single number.
 */
@Component({standalone:true,selector:'app-roadmap-report',imports:[ReportHtmlExportComponent,SbDonutComponent,SbPairComponent,FormsModule,RouterLink],template:`
<section class="card card-pad roadmap-effort-report">

<div class="rpt-head"><h2>Roadmap eforu</h2><div class="rpt-actions"><app-report-html-export [disabled]="loading||!!error" [report]="{kind:'roadmap',rows:visible,scope:'Tüm dönemler · '+kindLabel(kind)+' · '+(query||'Tüm referanslar')}" /><button class="btn" [disabled]="loading||!!error||!visible.length" (click)="exportCsv()">CSV indir</button></div></div>
<p class="rpt-aside">Atanan efor planlanan saattir; gerçek harcanan süre değildir. Mesai ayrı tutulur ve plana eklenmez.</p>
<div class="rpt-filters">
<label class="field">Roadmap ara<input [(ngModel)]="query" placeholder="Başlık veya TC / referans ID"></label>
<label class="field">Tür<select [(ngModel)]="kind"><option value="">Tüm türler</option><option value="PROJECT">Proje</option><option value="FEATURE_SET">Feature set</option><option value="GENERAL">Genel</option><option value="UNSPECIFIED">Tür belirtilmemiş</option></select></label>
</div>

@if(loading){<p class="rpt-empty" role="status">Roadmap eforu yükleniyor…</p>}
@else if(error){<p class="notice warn" role="alert">{{ error }}</p>}
@else if(!visible.length){<p class="rpt-empty">Bu kapsamda Roadmap öğesi yok. Roadmap oluşturup backlog işlerini bağladığınızda efor burada görünür.</p>}
@else{

<dl class="rpt-kpis six">
<div><dt>Roadmap öğesi</dt><dd>{{visible.length}}<small>öğe</small></dd></div>
<div><dt>Atanan efor</dt><dd>{{fmt(total('assignedHours'))}}<small>sa · planlanan</small></dd></div>
<div><dt>Done efor</dt><dd>{{fmt(total('doneHours'))}}<small>sa</small></dd></div>
<div><dt>Tamamlanan</dt><dd>{{doneShare===null?'—':'%'+fmt(doneShare)}}<small>atanan eforun payı</small></dd></div>
<div><dt>Undone efor</dt><dd [class.over]="total('undoneHours')>0">{{fmt(total('undoneHours'))}}<small>sa</small></dd></div>
<div><dt>Gerçekleşen mesai</dt><dd>{{fmt(total('overtimeHours'))}}<small>sa · plana ek</small></dd></div>
</dl>

<details class="rpt-note-fold"><summary>Özet değerlendirme</summary><ul class="rpt-findings">@for(f of findings;track f){<li>{{f}}</li>}</ul></details>

<div class="rpt-chart-grid"><section class="rpt-chart-card ">
<h3 class="rpt-sub">Efor hangi Roadmap öğelerine dağıldı</h3>
<div class="rpt-figure"><sb-donut [slices]="effortSlices" unit="sa" label="Roadmap öğelerinin planlanan efor payı" /></div>

</section>
<section class="rpt-chart-card ">
<h3 class="rpt-sub">Planın ne kadarı Done oldu</h3>
<p class="rpt-aside">Her satırda üstteki çubuk atanan planlanan eforu, alttaki Done olan eforu gösterir. En çok efor atanan {{landed.length}} öğe listelenir.</p>
<div class="rpt-figure"><sb-pair [rows]="landed" unit="sa" label="Roadmap başına atanan efor ve Done olan efor" fromLabel="Atanan" toLabel="Done" /></div>
<div class="rpt-key"><span><i style="background:#93a7b8"></i>Atanan efor (sa)</span><span><i style="background:#1f6f78"></i>Done olan efor (sa)</span></div>

</section>
</div>@if(total('overtimeHours')>0){<section class="rpt-chart-card">
<h3 class="rpt-sub">Bu eforun üstüne yazılan mesai</h3>
<div class="rpt-figure"><sb-donut [slices]="overtimeSlices" unit="sa" label="Roadmap bazlı gerçekleşen mesai dağılımı" /></div>
<p class="rpt-aside">Mesai planlanan efora eklenmez; kayıt anındaki Roadmap bağlantısına yazılır.</p></section>}

<div class="rpt-folds">
<details><summary><span>Roadmap rakamları</span><small>{{visible.length}} öğe</small></summary><div class="fold-body"><div class="table-wrap"><table>
<thead><tr><th scope="col">Roadmap</th><th scope="col">İş</th><th scope="col">Atanan</th><th scope="col">Done</th><th scope="col">Undone</th><th scope="col">Açık</th><th scope="col">Mesai</th><th scope="col">Havuz</th></tr></thead>
<tbody>@for(row of visible;track row.id){<tr>
 <td><a [routerLink]="['/roadmap',row.id]">{{row.title}}</a><small>{{kindLabel(row.kind)}} · {{row.referenceId||'Referans ID yok'}}</small></td>
 <td>{{row.taskCount}}<small>{{row.supportAssignmentCount}} X · {{row.unassignedTaskCount}} atamasız</small></td>
 <td>{{fmt(row.assignedHours)}} sa</td><td>{{fmt(row.doneHours)}} sa</td><td>{{fmt(row.undoneHours)}} sa</td><td>{{fmt(row.openHours)}} sa</td>
 <td>{{fmt(row.overtimeHours)}} sa</td><td>{{fmt(row.poolEstimatedHours)}} sa<small>{{row.poolCount}} sprint dışı</small></td>
</tr>}</tbody></table></div></div></details>

<details><summary><span>Nasıl hesaplanıyor?</span></summary><div class="fold-body">
<p>Atanan efor <b>planlanan</b> saattir, gerçek harcanan süre değildir. Tüm dönemler kapsanır: aktif, planlanan ve tamamlanan sprintler.</p>
<p>Mesai ayrı bir gerçekleşen saat kaydıdır ve plan toplamına eklenmez. Kayıt anındaki Roadmap bağlantısına aittir; eski bağlantısız mesailer bu dağılımda görünmez.</p>
<p>Bir görev bir kez sayılır; çoklu atamada her kişinin saati ayrı toplanır. Tekrar ve taşıma işleri kendi sprint atamalarıyla sayılır. X destek ve Leave saat toplamına girmez, diğer BAU dahildir.</p>
<p>Atamasız görevler 0 atanan saat gösterir; görev tahmini onun yerine kullanılmaz. Havuz tahmini sprinte girmemiş işlerindir ve atanan efora eklenmez. Kapalı sprintlerde varsa sabit kapanış atamaları kullanılır. Roadmap'e bağlanmamış işler bu rapora hiç girmez.</p>
</div></details>
</div>
}
</section>
`,styleUrls:['./report-design.css'],styles:[`:host{display:block;margin:20px 0}.roadmap-effort-report td small{display:block;color:#5a6b7b;font-size:11px}.roadmap-effort-report td{overflow-wrap:anywhere}.rpt-sub{margin:30px 0 10px;font-size:15px;color:#15202b}`]})
export class RoadmapReportComponent implements OnInit {
  @Output() readyChange=new EventEmitter<boolean>();
  private api=inject(ApiService);private cdr=inject(ChangeDetectorRef);
  rows:RoadmapEffort[]=[];loading=true;error='';query='';kind='';
  kindLabel(value:string){return ({PROJECT:'Proje',FEATURE_SET:'Feature set',GENERAL:'Genel',UNSPECIFIED:'Tür belirtilmemiş'} as Record<string,string>)[value]||'Tüm türler';}
  fmt(value:number){return new Intl.NumberFormat('tr-TR',{maximumFractionDigits:1}).format(value);}
  get visible(){const q=this.query.trim().toLocaleLowerCase('tr-TR');return this.rows.filter(r=>(!this.kind||r.kind===this.kind)&&(!q||(r.title+' '+(r.referenceId||'')).toLocaleLowerCase('tr-TR').includes(q))).sort((a,b)=>b.assignedHours-a.assignedHours);}
  total(key:'assignedHours'|'doneHours'|'undoneHours'|'openHours'|'poolEstimatedHours'|'overtimeHours'){return this.visible.reduce((sum,row)=>sum+row[key],0);}

  /** Eight colours is as many as a reader can hold; the rest collapse into one slice. */
  private readonly wheel=['#1f6f78','#c0362c','#6b5ca5','#d98c2b','#3f8f8a','#4a7fb5','#8d6e63','#9aa7b1'];
  get effortSlices():Slice[]{const rows=this.visible.filter(r=>r.assignedHours>0);
    const head=rows.slice(0,7).map((r,i)=>({label:r.title,value:r.assignedHours,fill:this.wheel[i],
      note:this.kindLabel(r.kind)+' · %'+this.fmt(Math.round(r.doneHours/r.assignedHours*1000)/10)+' Done'}));
    const rest=rows.slice(7).reduce((n,r)=>n+r.assignedHours,0);
    return rest>0?[...head,{label:'Diğer '+(rows.length-7)+' öğe',value:rest,fill:'#c3ccd3'}]:head;}
  get landed():Dumbbell[]{return this.visible.filter(r=>r.assignedHours>0).slice(0,10).map(r=>({key:r.id,label:r.title,
    from:r.assignedHours,to:r.doneHours,
    caption:r.title+': '+this.fmt(r.assignedHours)+' sa atanan, '+this.fmt(r.doneHours)+' sa Done (%'+this.fmt(Math.round(r.doneHours/r.assignedHours*1000)/10)+'), '+this.fmt(r.undoneHours)+' sa Undone, '+this.fmt(r.openHours)+' sa açık'}));}
  get overtimeSlices():Slice[]{const rows=this.visible.filter(r=>r.overtimeHours>0).sort((a,b)=>b.overtimeHours-a.overtimeHours);const head=rows.slice(0,7).map((r,i)=>({label:r.title,value:r.overtimeHours,fill:this.wheel[i],note:this.kindLabel(r.kind)}));const rest=rows.slice(7).reduce((v,r)=>v+r.overtimeHours,0);return rest>0?[...head,{label:'Diğer '+(rows.length-7)+' öğe',value:rest,fill:'#9aa7b1',note:'Kalan Roadmap öğeleri'}]:head;}
  get doneShare(){const t=this.total('assignedHours');return t>0?Math.round(this.total('doneHours')/t*1000)/10:null;}

  /** Findings are plain sentences built from the same totals the cards show, so the report
   *  never states anything the reader cannot verify in the table below. */
  get findings(){
   const n=this.visible.length,effort=this.total('assignedHours'),done=this.total('doneHours'),undone=this.total('undoneHours');
   if(!n||effort<=0)return ['Bu kapsamdaki Roadmap öğelerine henüz saatli atama yapılmamış.'];
   const out=[n+' Roadmap öğesine toplam '+this.fmt(effort)+' saat plan atandı.'];
   const share=this.doneShare;
   if(share!==null)out.push('Atanan planın %'+this.fmt(share)+'\u2019i Done oldu ('+this.fmt(done)+' saat).');
   if(undone>0)out.push('Undone kalan efor '+this.fmt(undone)+' saat.');
   const top=this.visible[0];
   if(top&&n>1)out.push('En büyük efor payı '+top.title+': '+this.fmt(top.assignedHours)+' saat (%'+this.fmt(Math.round(top.assignedHours/effort*1000)/10)+').');
   const lagging=this.visible.filter(r=>r.assignedHours>0).map(r=>({t:r.title,s:r.doneHours/r.assignedHours})).sort((a,b)=>a.s-b.s)[0];
   if(lagging&&n>1)out.push('En düşük tamamlanma oranı '+lagging.t+': %'+this.fmt(Math.round(lagging.s*1000)/10)+'.');
   const ot=this.total('overtimeHours');
   if(ot>0)out.push('Bu planın üstüne '+this.fmt(ot)+' saat mesai yazıldı.');
   return out;
  }

  async ngOnInit(){this.readyChange.emit(false);try{this.rows=await this.api.get<RoadmapEffort[]>('/reports/roadmap');}catch(e){this.error=String(e);}finally{this.loading=false;this.cdr.detectChanges();this.readyChange.emit(!this.error);}}
  exportCsv(){if(this.loading||this.error)return;downloadText(csv([['Kapsam','Tür','Referans ID','Roadmap','Sprint işleri','Done','Undone','Açık','Atanan planlanan saat','Gerçekleşen mesai saat (ayrı)','Done atanan saat','Undone atanan saat','Açık atanan saat','Havuz iş','Havuz tahmini saat','X atama','Atamasız iş'],...this.visible.map(r=>['Tüm dönemler; gerçek harcanan süre değildir',this.kindLabel(r.kind),r.referenceId,r.title,r.taskCount,r.done,r.undone,r.open,r.assignedHours,r.overtimeHours,r.doneHours,r.undoneHours,r.openHours,r.poolCount,r.poolEstimatedHours,r.supportAssignmentCount,r.unassignedTaskCount])]),'text/csv;charset=utf-8','sprintboard-roadmap-efor.csv');}
}
