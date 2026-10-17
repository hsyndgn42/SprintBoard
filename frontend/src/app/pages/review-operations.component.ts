import {Component,Input,Output,EventEmitter,OnChanges,inject,ChangeDetectorRef} from '@angular/core';
import {ApiService,Sprint,SprintSummary,OvertimeRecord,OvertimeEntry,CapacityRow} from '../api.service';
import {ListPagerComponent} from '../list-pager.component';
import {overtimeTrend} from './operational-trends.model';
import {ReviewOperations,reviewOperations} from './review-operations.model';
@Component({selector:'app-review-operations',standalone:true,imports:[ListPagerComponent],template:`
<section class="card card-pad review-operations"><div class="section-head"><div><span class="eyebrow">MESAİ</span><h2>{{sprint.name}} · Gerçekleşen mesai</h2></div></div>
@if(loading){<p role="status">Sprint katkıları yükleniyor…</p>}@else if(error){<p class="notice warn" role="alert">{{error}} <button class="btn" (click)="load()">Yeniden dene</button></p>}@else if(model){
<div class="metrics"><div><small>Bu sprintte kayıtlı toplam mesai</small><strong>{{model.earned}} sa</strong></div></div>
<section class="external-support"><span class="eyebrow">EKİBE SAĞLANAN DESTEK</span><h2>Ekip dışı destek / Architecture</h2><div class="metrics"><div><small>Atanan destek eforu</small><strong>{{model.supportHours}} sa</strong></div></div><p class="data-note">Dış ekip ve Architecture katkısıdır; Defect Support rezervinden ayrıdır. X destek saat toplamına eklenmez. Saatler planlanan görev eforudur.</p>
<app-list-pager #pager [items]="model.people" label="Support katkıları"/>
@for(p of pager.rows;track p.id){<div class="support-row"><strong>{{p.name}}</strong><span>{{p.hours}} sa @if(p.xCount){<small>· {{p.xCount}} X destek</small>}</span><div class="track"><span [style.width.%]="100*p.hours/maxHours"></span></div></div>}@empty{<p>Saatli veya X destek ataması yok.</p>}
</section>}</section>`,styles:[`:host{display:block;margin:24px 0}.external-support{margin-top:28px;padding-top:28px;border-top:2px solid #dce5ef}.metrics{display:grid;grid-template-columns:1fr;gap:16px;margin:20px 0}.metrics>div{padding:20px;background:#f5f8ff;border:1px solid #dce5ef;border-radius:12px}.metrics small,.metrics strong{display:block}.metrics strong{font-size:28px;margin-top:8px}.support-row{display:grid;grid-template-columns:1fr auto;gap:10px;padding:16px 0;border-bottom:1px solid #e4eaf2}.track{grid-column:1/-1;height:8px;background:#e9eff8;border-radius:5px;overflow:hidden}.track span{display:block;height:100%;background:#2563eb}@media(max-width:500px){.metrics{grid-template-columns:1fr}}`]})
export class ReviewOperationsComponent implements OnChanges{
 @Input({required:true})sprint!:Sprint;@Output()readyChange=new EventEmitter<boolean>();@Output()loaded=new EventEmitter<ReviewOperations>();
 private api=inject(ApiService);private cdr=inject(ChangeDetectorRef);private generation=0;
 loading=true;error='';model:ReviewOperations|null=null;
 get maxHours(){return Math.max(1,...(this.model?.people||[]).map(p=>p.hours))}
 ngOnChanges(){void this.load()}
 async load(){const gen=++this.generation,sprint=this.sprint;this.loading=true;this.error='';this.model=null;this.readyChange.emit(false);
 try{const [s,r,e,c]=await Promise.all([this.api.get<SprintSummary[]>('/sprints'),this.api.get<OvertimeRecord[]>('/overtime'),this.api.get<OvertimeEntry[]>('/overtime/entries'),this.api.get<CapacityRow[]>('/sprints/'+encodeURIComponent(sprint.id)+'/capacity')]);if(gen!==this.generation)return;this.model=reviewOperations(sprint,overtimeTrend(s,r,e,[]),c);this.loaded.emit(this.model);this.readyChange.emit(true);}
 catch{if(gen===this.generation)this.error='Sprint mesai ve Support bilgileri alınamadı.';}finally{if(gen===this.generation){this.loading=false;this.cdr.detectChanges();}}}
}
