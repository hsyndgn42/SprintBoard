import {Component,Input,Output,EventEmitter,inject,ChangeDetectorRef} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ApiService} from '../api.service';
import {ModalAccessibilityDirective} from '../modal-accessibility.directive';
@Component({selector:'app-work-item-action',standalone:true,imports:[FormsModule,ModalAccessibilityDirective],template:`
<div class="modal-layer"><form class="modal" role="dialog" aria-modal="true" aria-labelledby="work-action-title" (ngSubmit)="save()">
 <header><h2 id="work-action-title">{{action==='rename'?'Görev adını düzenle':'Backlog işini sil'}}</h2><p style="overflow-wrap:anywhere">{{title}}</p></header>
 <div class="modal-body">
 @if(action==='rename'){<label class="field">Yeni görev adı<input name="newTaskTitle" [(ngModel)]="newTitle" maxlength="300" required [disabled]="busy"></label><p class="data-note">Backlog ve sprint adı birlikte güncellenir. Önceki ad işlem günlüğünde korunur.</p>}
 @else{<p>Bu iş backlog havuzundan kalıcı olarak kaldırılacak. Geri almak için yedek gerekir. İşlem denetim kaydı ve varsa eski sprint günlükleri korunur.</p><p class="data-note">Sprintteki veya başka kayıtların bağlı olduğu işler silinmez.</p>}
 @if(error){<p class="notice warn" role="alert">{{error}}</p>}
 </div><footer><button type="button" data-modal-dismiss class="btn" [disabled]="busy" (click)="cancel.emit()">Vazgeç</button><button type="submit" class="btn" [class.primary]="action==='rename'" [class.danger]="action==='delete'" [disabled]="busy||(action==='rename'&&(!newTitle.trim()||newTitle.trim()===title))">{{busy?'Kaydediliyor…':action==='rename'?'Adı kaydet':'Evet, işi sil'}}</button></footer>
</form></div>`})
export class WorkItemActionComponent{
 @Input({required:true})id!:string;@Input({required:true})title!:string;@Input()action:'rename'|'delete'='rename';
 @Output()cancel=new EventEmitter<void>();@Output()saved=new EventEmitter<void>();
 private api=inject(ApiService);private cdr=inject(ChangeDetectorRef);newTitle='';busy=false;error='';
 ngOnInit(){this.newTitle=this.title;}
 async save(){if(this.busy)return;this.busy=true;this.error='';this.cdr.detectChanges();try{
  if(this.action==='rename')await this.api.put('/tasks/'+encodeURIComponent(this.id)+'/title',{title:this.newTitle.trim(),expectedTitle:this.title});
  else await this.api.post('/backlog/'+encodeURIComponent(this.id)+'/delete',{confirmed:true,expectedTitle:this.title});
  this.saved.emit();
 }catch(e){this.error=String(e);}finally{this.busy=false;this.cdr.detectChanges();}}
}
