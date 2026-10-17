import {Component,Input,Output,EventEmitter,inject,ChangeDetectorRef} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ApiService,CapacityRow,Sprint} from '../api.service';
import {ModalAccessibilityDirective} from '../modal-accessibility.directive';
import {OvertimeTaskPickerComponent} from './overtime-task-picker.component';
@Component({selector:'app-planned-overtime-dialog',standalone:true,imports:[FormsModule,ModalAccessibilityDirective,OvertimeTaskPickerComponent],template:`
<div class="modal-layer"><form class="modal" (ngSubmit)="save()"><header><h2>Planlı mesai ekle</h2><p>{{row.memberName}} · {{sprint.name}}</p></header>
<div class="modal-body form-grid"><label class="field">Eklenecek mesai (saat)<input name="plannedOvertimeHours" type="number" min="0.5" max="500" step="0.5" required [(ngModel)]="hours"></label>
<app-overtime-task-picker [sprintId]="sprint.id" [(value)]="taskId"/>
<label class="field">Not<textarea name="plannedOvertimeNote" rows="2" maxlength="500" [(ngModel)]="note"></textarea></label>
<div class="preview"><span>Mevcut planlı mesai <strong>{{row.overtimeHours}} sa</strong></span><span>Kayıt sonrası <strong>{{row.overtimeHours+validHours}} sa</strong></span><span>Kişi kapasitesi <strong>{{row.availableHours}} → {{row.availableHours+validHours}} sa</strong></span></div>
<p class="data-note">Mevcut plana eklenir. Gerçekleşen mesai veya hakediş oluşturmaz; görev eforunu değiştirmez.</p>
@if(row.supportMember){<p class="data-note">Bu kişi Support kapsamındadır; çekirdek ekip kapasite toplamına dahil edilmez.</p>}
@if(error){<p class="notice warn" role="alert">{{error}}</p>}</div>
<footer><button class="btn" type="button" data-modal-dismiss [disabled]="saving" (click)="cancelled.emit()">Vazgeç</button><button class="btn primary" type="submit" [disabled]="saving||!valid">{{saving?'Kaydediliyor…':'Planlı mesaiyi kaydet'}}</button></footer></form></div>`,styles:[`.preview{display:grid;gap:10px;background:#f4f7fc;border:1px solid #dce5ef;border-radius:10px;padding:16px}.preview span{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}`]})
export class PlannedOvertimeDialogComponent{
 @Input({required:true})sprint!:Sprint;@Input({required:true})row!:CapacityRow;
 @Output()cancelled=new EventEmitter<void>();@Output()saved=new EventEmitter<string>();
 private api=inject(ApiService);private cdr=inject(ChangeDetectorRef);
 hours:number|null=null;taskId='';note='';saving=false;error='';
 get valid(){return typeof this.hours==='number'&&Number.isFinite(this.hours)&&this.hours>=0.5&&this.hours<=500&&Number.isInteger(this.hours*2)}
 get validHours(){return this.valid?this.hours!:0}
 async save(){if(this.saving||!this.valid||this.sprint.status==='completed')return;this.saving=true;this.error='';
 try{await this.api.post('/overtime/entries',{memberId:this.row.memberId,sprintId:this.sprint.id,taskId:this.taskId,earnedHours:0,usedHours:0,plannedHours:this.hours,includeInCapacity:true,note:this.note});this.saved.emit(this.sprint.id);}
 catch(e){this.error=String(e);this.saving=false;this.cdr.detectChanges();}}
}
