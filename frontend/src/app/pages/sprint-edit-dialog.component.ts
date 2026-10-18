import {Component,Input,Output,EventEmitter,OnInit,ChangeDetectorRef,inject} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ApiService,Sprint} from '../api.service';
import {ModalAccessibilityDirective} from '../modal-accessibility.directive';

@Component({selector:'app-sprint-edit-dialog',standalone:true,imports:[FormsModule,ModalAccessibilityDirective],template:`
<div class="modal-layer"><form class="modal" #editForm="ngForm" (ngSubmit)="editForm.valid && save()">
 <header><h2>Sprinti düzenle</h2><p>Ad, hedef ve tarih aralığı</p></header>
 <div class="modal-body form-grid">
  <label class="field">Sprint adı<input name="editName" [(ngModel)]="draft.name" required maxlength="160"></label>
  <label class="field">Hedef (isteğe bağlı)<textarea name="editGoal" [(ngModel)]="draft.goal" maxlength="10000" rows="3" placeholder="Hedefi daha sonra belirleyebilirsiniz."></textarea></label>
  <div class="form-grid two"><label class="field">Başlangıç<input type="date" name="editStart" [(ngModel)]="draft.start" required></label><label class="field">Bitiş (dahil)<input type="date" name="editEnd" [(ngModel)]="draft.end" [min]="draft.start" required></label></div>
  <p class="data-note">Tarih değişince çalışma günleri, tatil ve izin etkisi yeniden hesaplanır. Görev eforları, elle ayrılan günler, planlı mesai ve kayıtlı çalışma düzeni korunur; planı yeni kapasiteye göre kontrol edin.</p>
  @if(error){<p class="notice warn" role="alert">{{error}}</p>}
 </div><footer><button type="button" data-modal-dismiss class="btn" [disabled]="saving" (click)="cancel.emit()">Vazgeç</button><button class="btn primary" [disabled]="saving||editForm.invalid||!draft.name.trim()||draft.end<draft.start">{{saving?'Kaydediliyor…':'Değişiklikleri kaydet'}}</button></footer>
</form></div>`})
export class SprintEditDialogComponent implements OnInit {
 @Input({required:true})sprint!:Sprint;
 @Output()cancel=new EventEmitter<void>();@Output()saved=new EventEmitter<string>();
 private api=inject(ApiService);private cdr=inject(ChangeDetectorRef);
 draft={name:'',goal:'',start:'',end:'',editVersion:''};saving=false;error='';
 ngOnInit(){this.draft={name:this.sprint.name,goal:this.sprint.goal||'',start:this.sprint.start,end:this.sprint.end,editVersion:this.sprint.editVersion||''};}
 async save(){if(this.saving)return;this.saving=true;this.error='';try{await this.api.put('/sprints/'+encodeURIComponent(this.sprint.id),this.draft);this.saved.emit(this.sprint.id);}catch(e){this.error=String(e);}finally{this.saving=false;this.cdr.detectChanges();}}
}
