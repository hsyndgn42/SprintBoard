import { ReportHtmlExportComponent } from './report-html-export.component';
import { SbRankedComponent,Ranked } from './report-charts';
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
@Component({standalone:true,selector:'app-roadmap-report',imports:[ReportHtmlExportComponent,SbRankedComponent,FormsModule,RouterLink],template:`
<section class="card card-pad roadmap-effort-report">

<div class="rpt-head"><h2>Roadmap eforu</h2><div class="rpt-actions"><app-report-html-export [disabled]="loading||!!error" [report]="{kind:'roadmap',rows:visible,scope:'Tüm dönemler · '+kindLabel(kind)+' · '+(query||'Tüm referanslar')}" /><button class="btn" [disabled]="loading||!!error||!visible.length" (click)="exportCsv()">CSV indir</button></div></div>
<p class="rpt-verdict" [innerHTML]="verdict"></p>

<div class="rpt-filters">
<label class="field">Roadmap ara<input [(ngModel)]="query" placeholder="Başlık veya TC / referans ID"></label>
<label class="field">Tür<select [(ngModel)]="kind"><option value="">Tüm türler</option><option value="PROJECT">Proje</option><option value="FEATURE_SET">Feature set</option><option value="GENERAL">Genel</option><option value="UNSPECIFIED">Tür belirtilmemiş</option></select></label>
</div>

@if(loading){<p class="rpt-empty" role="status">Roadmap eforu yükleniyor…</p>}
@else if(error){<p class="notice warn" role="alert">{{ error }}</p>}
@else if(!visible.length){<p class="rpt-empty">Bu kapsamda Roadmap öğesi yok. Roadmap oluşturup backlog işlerini bağladığınızda efor burada görünür.</p>}
@else{

<dl class="rpt-kpis">
<div><dt>Roadmap öğesi</dt><dd>{{visible.length}}</dd></div>
<div><dt>Atanan efor</dt><dd>{{fmt(total('assignedHours'))}}<small>sa</small></dd></div>
<div><dt>Tamamlanan</dt><dd>{{doneShare===null?'—':'%'+fmt(doneShare)}}</dd></div>
<div><dt>Gerçekleşen mesai</dt><dd>{{fmt(total('overtimeHours'))}}<small>sa</small></dd></div>
</dl>

<div class="rpt-figure"><sb-ranked [rows]="ranked" unit="sa" [average]="averageEffort" averageLabel="ortalama" label="Roadmap öğelerine atanan planlanan efor; Done, Undone ve açık kırılımıyla" /></div>
<div class="rpt-key"><span><i class="f-measure"></i>Done</span><span><i class="f-over"></i>Undone</span><span><i class="f-spare"></i>Açık</span><span><i class="dash"></i>Ortalama efor</span></div>

@if(total('overtimeHours')>0){
<h3 class="rpt-sub">Bu eforun üstüne yazılan mesai</h3>
<div class="rpt-figure"><sb-ranked [rows]="overtimeRanked" unit="sa" [average]="averageOvertime" averageLabel="ortalama" label="Roadmap bazlı gerçekleşen mesai" /></div>
<p class="rpt-aside">Mesai planlanan efora eklenmez; kayıt anındaki Roadmap bağlantısına yazılır.</p>}

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

  /** Only the first dozen fit on a readable chart; the rest stay in the table. */
  get ranked():Ranked[]{return this.visible.slice(0,12).map(r=>({key:r.id,label:r.title,note:this.kindLabel(r.kind)+(r.referenceId?' · '+r.referenceId:''),
    caption:r.title+': '+this.fmt(r.assignedHours)+' sa atanan, '+this.fmt(r.doneHours)+' Done, '+this.fmt(r.undoneHours)+' Undone, '+this.fmt(r.openHours)+' açık',
    segments:[{label:'Done',value:r.doneHours,fill:'#1f6f78'},{label:'Undone',value:r.undoneHours,fill:'#c0362c'},{label:'Açık',value:r.openHours,fill:'#b9c4cb'}]}));}
  get overtimeRanked():Ranked[]{return this.visible.filter(r=>r.overtimeHours>0).sort((a,b)=>b.overtimeHours-a.overtimeHours).slice(0,8)
    .map(r=>({key:r.id,label:r.title,caption:r.title+': '+this.fmt(r.overtimeHours)+' sa mesai',segments:[{label:'Mesai',value:r.overtimeHours,fill:'#6b5ca5'}]}));}
  get averageEffort(){return this.visible.length?this.total('assignedHours')/this.visible.length:null;}
  get averageOvertime(){const w=this.visible.filter(r=>r.overtimeHours>0);return w.length?this.total('overtimeHours')/w.length:null;}
  get doneShare(){const t=this.total('assignedHours');return t>0?Math.round(this.total('doneHours')/t*1000)/10:null;}

  get verdict(){
   const n=this.visible.length,top=this.visible[0],effort=this.total('assignedHours'),share=this.doneShare;
   if(!n||effort<=0)return 'Bu kapsamdaki Roadmap öğelerine henüz saatli atama yapılmamış.';
   let text=n+' Roadmap öğesine toplam <b>'+this.fmt(effort)+' saat</b> plan atandı.';
   if(top&&n>1)text+=' Eforun en büyük payı '+this.esc(top.title)+' (%'+this.fmt(Math.round(top.assignedHours/effort*1000)/10)+').';
   if(share!==null)text+=' Bu planın <b>%'+this.fmt(share)+'</b>\u2019i Done oldu';
   const undone=this.total('undoneHours');
   text+=undone>0?', <b class="over">'+this.fmt(undone)+' saat</b> Undone kaldı.':'.';
   return text;
  }
  private esc(value:string){return value.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!));}

  async ngOnInit(){this.readyChange.emit(false);try{this.rows=await this.api.get<RoadmapEffort[]>('/reports/roadmap');}catch(e){this.error=String(e);}finally{this.loading=false;this.cdr.detectChanges();this.readyChange.emit(!this.error);}}
  exportCsv(){if(this.loading||this.error)return;downloadText(csv([['Kapsam','Tür','Referans ID','Roadmap','Sprint işleri','Done','Undone','Açık','Atanan planlanan saat','Gerçekleşen mesai saat (ayrı)','Done atanan saat','Undone atanan saat','Açık atanan saat','Havuz iş','Havuz tahmini saat','X atama','Atamasız iş'],...this.visible.map(r=>['Tüm dönemler; gerçek harcanan süre değildir',this.kindLabel(r.kind),r.referenceId,r.title,r.taskCount,r.done,r.undone,r.open,r.assignedHours,r.overtimeHours,r.doneHours,r.undoneHours,r.openHours,r.poolCount,r.poolEstimatedHours,r.supportAssignmentCount,r.unassignedTaskCount])]),'text/csv;charset=utf-8','sprintboard-roadmap-efor.csv');}
}
