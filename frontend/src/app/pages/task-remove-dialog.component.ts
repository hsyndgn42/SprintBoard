import { ModalAccessibilityDirective } from '../modal-accessibility.directive';
import { ChangeDetectorRef, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, Task } from '../api.service';

/** Pulling work out of a sprint that has not started is a planning correction, not a scope change,
 *  so this dialog stays simpler than the board's: no emergency swap, no scope-change wording. */
@Component({selector:'app-task-remove-dialog',standalone:true,imports:[ModalAccessibilityDirective,FormsModule],template:`
<div class="modal-layer"><form class="modal" (ngSubmit)="submit()" aria-labelledby="task-remove-title">
<header><h2 id="task-remove-title">Backlog’a geri gönder</h2><p>{{task.name}}</p></header>
<div class="modal-body form-grid">
<p class="notice">Sprint henüz başlamadı. İş Undone sayılmadan backlog havuzuna döner ve kapsam değişimi olarak kaydedilmez. Bu sprintteki kişi atamaları kaldırılır; işin geçmişi korunur.</p>
<label class="field">Planlama notu<textarea name="removeReason" [(ngModel)]="reason" (ngModelChange)="changed()" required maxlength="2000" rows="4" placeholder="Örn. bağımlılığı çözülmedi, sonraki sprinte bırakıldı"></textarea></label>
<label class="check"><input type="checkbox" name="confirmRemove" [(ngModel)]="confirmed" (ngModelChange)="changed()"><span>İşi sprintten çıkarıp backlog’a döndürmeyi onaylıyorum.</span></label>
@if(error){<p class="notice warn" role="alert">{{error}}</p>}
</div><footer><button data-modal-dismiss type="button" class="btn" [disabled]="saving" (click)="cancel.emit()">Vazgeç</button><button type="submit" class="btn primary" [disabled]="saving||!reason.trim()||!confirmed">{{saving?'Gönderiliyor…':'Backlog’a geri gönder'}}</button></footer>
</form></div>`,
styles:[`.modal{max-width:560px}.check{display:flex;align-items:flex-start;gap:10px;font-size:13px;line-height:1.6}.check input{flex:none;margin-top:4px}h2{margin:0}`]})
export class TaskRemoveDialogComponent {
 @Input({required:true}) task!:Task;
 @Output() cancel=new EventEmitter<void>();@Output() removed=new EventEmitter<string>();
 private api=inject(ApiService);private cdr=inject(ChangeDetectorRef);
 reason='';confirmed=false;saving=false;error='';
 changed(){this.cdr.detectChanges();}
 async submit(){if(this.saving||!this.reason.trim()||!this.confirmed)return;this.saving=true;this.error='';this.changed();
  try{
   await this.api.post(`/tasks/${encodeURIComponent(this.task.id)}/remove`,{reason:this.reason.trim(),confirmed:true,fingerprint:this.task.flowFingerprint,replacementTaskId:''});
   this.removed.emit(`${this.task.name} backlog havuzuna geri gönderildi.`);
  }catch(e){this.error=String(e);}
  finally{this.saving=false;this.changed();}}
}
