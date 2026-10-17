import {Component,Input,Output,EventEmitter,OnInit,inject,ChangeDetectorRef} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ApiService,CapacityRow,Sprint,OvertimeEntry} from '../api.service';
import {ModalAccessibilityDirective} from '../modal-accessibility.directive';
import {ListPagerComponent} from '../list-pager.component';
@Component({selector:'app-planned-overtime-list',standalone:true,imports:[FormsModule,ModalAccessibilityDirective,ListPagerComponent],template:`
<div class="modal-layer"><form class="modal" (ngSubmit)="commit()"><header><h2>{{selected?(removing?'Planlı mesaiyi sil':'Planlı mesaiyi düzenle'):'Planlı mesai kayıtları'}}</h2><p>{{row.memberName}} · {{sprint.name}}</p></header><div class="modal-body">
@if(message){<p class="notice" role="status">{{message}}</p>}
@if(error){<p class="notice warn" role="alert">{{error}}</p>}
@if(selected;as entry){
<p><strong>{{entry.taskTitle||'Genel / göreve bağlanmadı'}}</strong></p><p class="data-note">{{entry.note}}</p>
@if(removing){<p>{{entry.plannedHours}} saatlik mesai planını silmek istediğine emin misin?</p>}@else{<label class="field">Yeni planlanan mesai (saat)<input type="number" name="editPlannedHours" min="0.25" max="500" step="0.25" required [(ngModel)]="hours"></label>}
<div class="preview"><span>Bu kayıt <strong>{{entry.plannedHours}} → {{removing?0:validHours}} sa</strong></span><span>Kişi kapasitesi <strong>{{row.availableHours}} → {{row.availableHours+delta}} sa</strong></span></div>
<p class="data-note">{{entry.includeInCapacity?'Kapasite fark kadar güncellenir.':'Bu kayıt kapasiteye dahil değil; kapasite değişmez.'}} Gerçekleşen mesai, hakediş ve görev eforu korunur.</p>
} @else if(loading){<p role="status">Mesai planları yükleniyor…</p>}@else{
<p class="data-note">Yalnız bu kişiye ve sprinte ait planlar. Gerçekleşen mesai ayrı kayıttır; buradan silinmez.</p>
<app-list-pager #pager [items]="entries" label="Mesai planları"/>
@for(e of pager.rows;track e.id){<article class="plan-entry"><div><strong>{{e.plannedHours}} sa plan{{e.plannedHours===0?' · İptal edildi':''}}</strong><small>Gerçekleşen {{e.planActualHours||0}} sa · Kalan {{remaining(e)}} sa · Aşan {{excess(e)}} sa</small><span>{{e.taskTitle||'Genel / göreve bağlanmadı'}}</span><small>{{e.includeInCapacity?'Kapasiteye dahil':'Kapasiteye dahil değil'}}</small>@if(e.note){<small>{{e.note}}</small>}</div><div class="actions">@if(e.plannedHours>0){<button class="btn small" type="button" [attr.data-plan-edit]="e.id" (click)="select(e,false)">Düzenle</button><button class="btn small danger" type="button" [attr.data-plan-delete]="e.id" (click)="select(e,true)">Sil</button>}</div></article>}@empty{<p>Planlı mesai kaydı yok.</p>}
<button class="btn small" type="button" (click)="load()">Listeyi yenile</button>
}</div><footer>@if(selected){<button class="btn" type="button" data-modal-dismiss [disabled]="saving" (click)="back()">Vazgeç</button><button class="btn primary" type="submit" [disabled]="saving||(!removing&&!valid)">{{saving?'Kaydediliyor…':removing?'Planı sil':'Değişikliği kaydet'}}</button>}@else{<button class="btn" type="button" data-modal-dismiss (click)="closed.emit()">Kapat</button>}</footer></form></div>`,styles:[`.plan-entry{display:flex;justify-content:space-between;gap:16px;padding:18px 0;border-bottom:1px solid #e1e7f0}.plan-entry span,.plan-entry small{display:block;margin-top:6px;overflow-wrap:anywhere}.plan-entry small{color:#64748b}.actions{display:flex;align-items:start;gap:8px}.preview{padding:16px;background:#f3f6fb;border-radius:10px;margin:20px 0;display:grid;gap:12px}.preview span{display:flex;justify-content:space-between;gap:8px}.danger{color:#b42318}@media(max-width:500px){.plan-entry{flex-direction:column}.actions{justify-content:flex-end}}`]})
export class PlannedOvertimeListComponent implements OnInit{
 @Input({required:true})sprint!:Sprint;@Input({required:true})row!:CapacityRow;
 @Output()closed=new EventEmitter<void>();@Output()changed=new EventEmitter<string>();
 private api=inject(ApiService);private cdr=inject(ChangeDetectorRef);
 entries:OvertimeEntry[]=[];selected:OvertimeEntry|null=null;hours:number|null=null;removing=false;loading=true;saving=false;error='';message='';
 remaining(e:OvertimeEntry){return Math.max(0,e.plannedHours-(e.planActualHours||0))}excess(e:OvertimeEntry){return Math.max(0,(e.planActualHours||0)-e.plannedHours)}
 ngOnInit(){void this.load()}
 get valid(){return typeof this.hours==='number'&&Number.isFinite(this.hours)&&this.hours>0&&this.hours<=500}
 get validHours(){return this.valid?this.hours!:0}
 get delta(){return this.selected?.includeInCapacity?(this.removing?0:this.validHours)-this.selected.plannedHours:0}
 async load(){this.loading=true;this.error='';try{this.entries=(await this.api.get<OvertimeEntry[]>('/overtime/entries')).filter(e=>e.memberId===this.row.memberId&&e.sprintId===this.sprint.id&&(e.plannedHours>0||(e.planActualHours||0)>0));}catch(e){this.error=String(e);}finally{this.loading=false;this.cdr.detectChanges();}}
 select(e:OvertimeEntry,remove:boolean){this.selected=e;this.hours=e.plannedHours;this.removing=remove;this.error='';this.message='';this.cdr.detectChanges();}
 back(){if(this.saving)return;this.selected=null;this.error='';this.cdr.detectChanges();}
 async commit(){if(this.saving||!this.selected||(!this.removing&&!this.valid))return;this.saving=true;this.error='';const entry=this.selected;
 const payload={expectedHours:entry.plannedHours,expectedIncluded:entry.includeInCapacity,plannedHours:this.hours,confirmed:this.removing};
 try{const path='/overtime/entries/'+encodeURIComponent(entry.id)+'/plan';if(this.removing)await this.api.delete(path,payload);else await this.api.put(path,payload);
 this.selected=null;this.message=this.removing?'Mesai planı silindi. Gerçekleşen mesai ve hakediş korundu.':'Mesai planı güncellendi.';this.changed.emit(this.sprint.id);await this.load();}
 catch(e){this.error=String(e);}finally{this.saving=false;this.cdr.detectChanges();}}
}
