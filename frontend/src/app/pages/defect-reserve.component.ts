import {Component,Input,Output,EventEmitter,OnChanges,inject,ChangeDetectorRef} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ApiService,Sprint,Task,DefectReserveSummary} from '../api.service';
@Component({selector:'app-reserve-link',standalone:true,imports:[FormsModule],template:`
<label class="field">Efor kaynağı<select aria-label="Defect efor kaynağı" [(ngModel)]="choice" (ngModelChange)="changed()" [disabled]="saving"><option value="">Ek plan · rezerv kullanma</option>@for(r of reserves;track r.id){<option [value]="r.id">{{r.name}}</option>}</select></label>
@if(choice!==(task.reserveTaskId||'')){<button class="btn small" [disabled]="saving" (click)="save()">Kaydet</button><button class="btn small" [disabled]="saving" (click)="reset();changed()">Vazgeç</button>}
@if(error){<p role="alert">{{error}}</p>}`,styles:[`:host{display:block;min-width:170px;margin-top:8px}.field{font-size:12px}select{max-width:230px}p{color:#b42318}`]})
export class ReserveLinkComponent implements OnChanges {
 @Input({required:true})task!:Task;@Input({required:true})sprint!:Sprint;@Output()updated=new EventEmitter<void>();
 private api=inject(ApiService);private cdr=inject(ChangeDetectorRef);choice='';saving=false;error='';
 get reserves(){return this.sprint.items.filter(t=>t.taskCategory==='BAU'&&t.taskSubtype==='DEFECT_SUPPORT');}
 changed(){this.cdr.detectChanges();}
 ngOnChanges(){this.reset();}reset(){this.choice=this.task.reserveTaskId||'';this.error='';}
 async save(){this.saving=true;this.error='';try{await this.api.put('/tasks/'+encodeURIComponent(this.task.id)+'/reserve',{reserveTaskId:this.choice});this.updated.emit();}catch(e){this.error=String(e);}finally{this.saving=false;this.cdr.detectChanges();}}
}
@Component({selector:'app-defect-reserves',standalone:true,template:`
@if(rows.length){<section class="card card-pad reserve-summary"><span class="eyebrow">DEFECT SUPPORT</span><h2>Rezerv ve defect planı</h2><p class="data-note">Ayrılan rezerv + aşım = toplam plan. Defectlere dağıtılan saatler ikinci kez eklenmez; gerçekleşen çalışma süresi değildir.</p>
@for(r of rows;track r.taskId){<article><h3>{{r.sprintName?r.sprintName+' · ':''}}{{r.name}}</h3><div class="reserve-track" role="img" [attr.aria-label]="'Karşılanan '+r.coveredHours+', kalan '+r.remainingHours+', aşan '+r.overHours+' saat'"><i [style.width.%]="width(r,r.coveredHours)" style="background:#2563eb"></i><i [style.width.%]="width(r,r.remainingHours)" style="background:#cbd5e1"></i><i [style.width.%]="width(r,r.overHours)" style="background:#d97706"></i></div><div class="reserve-values"><span>Ayrılan <b>{{r.reservedHours}} sa</b></span><span>Defectlere dağıtılan <b>{{r.allocatedHours}} sa</b></span><span>Kalan <b>{{r.remainingHours}} sa</b></span><span>Aşan <b>{{r.overHours}} sa</b></span><span>{{r.defectCount}} defect</span></div>
@if(r.unassignedDefectHours){<p class="notice warn">{{r.unassignedDefectHours}} saat defect tahmininin kişi ataması yok; rezervden karşılanmaz.</p>}
<details><summary>Kişi bazlı rezerv</summary>@for(m of r.members;track m.memberId){<div class="reserve-person"><strong>{{m.memberName}}</strong><span>{{m.reservedHours}} sa ayrılan · {{m.allocatedHours}} sa dağıtılan · {{m.remainingHours}} sa kalan · {{m.overHours}} sa aşan</span></div>}@empty{<p>Kişi ataması yaparak rezerv ayırın.</p>}</details></article>}</section>}
`,styles:[`.reserve-summary{margin:20px 0}.reserve-summary h2{margin:6px 0 12px}article{padding:16px 0;border-top:1px solid #e3eaf4}h3{font-size:15px}.reserve-track{height:16px;display:flex;overflow:hidden;border-radius:8px;background:#edf1f7}.reserve-track i{display:block;height:100%}.reserve-values{display:flex;gap:12px 24px;flex-wrap:wrap;font-size:13px;margin:12px 0}.reserve-values b{display:block;margin-top:4px}summary{cursor:pointer;font-size:13px;color:#1565c0}.reserve-person{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:12px 0;border-bottom:1px solid #edf1f7;font-size:13px}.data-note{font-size:12px;color:#60758e;line-height:1.6}@media print{details{display:none}}`]})
export class DefectReservesComponent {
 @Input()rows:DefectReserveSummary[]=[];
 width(r:DefectReserveSummary,h:number){return r.reservedHours+r.overHours>0?100*h/(r.reservedHours+r.overHours):0;}
}
