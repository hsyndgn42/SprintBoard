import { ModalAccessibilityDirective } from '../modal-accessibility.directive';
import { ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, SprintSummary } from '../api.service';
import { POOL_CHOICE, RepeatResult, SprintTarget, repeatSuccessMessage, repeatTargets, sprintOptionLabel } from './sprint-target.model';

@Component({selector:'app-backlog-repeat-dialog',standalone:true,imports:[ModalAccessibilityDirective,FormsModule],template:`
<div class="modal-layer"><form class="modal" (ngSubmit)="submit()" aria-labelledby="repeat-title">
<header><span class="eyebrow">YENİ İŞ OLARAK TEKRARLA</span><h2 id="repeat-title">{{title}}</h2><p>Kapsam, efor, öncelik, roadmap bağlantısı ve bağımlılıklar kopyalanır. Özgün iş olduğu gibi kalır.</p></header>
<div class="modal-body form-grid">
@if(loading){<p role="status">Sprintler yükleniyor…</p>}
@else{
 <label class="field">Yeni iş nereye gitsin?<select name="target" [(ngModel)]="target" [disabled]="saving">
  <option [value]="pool">Backlog havuzuna ekle</option>
  @for(sprint of targets;track sprint.id){<option [value]="sprint.id">{{label(sprint)}}</option>}
 </select></label>
 @if(!targets.length){<p class="data-note">Henüz başlamamış bir sprint yok; yeni iş havuza eklenir.</p>}
 @else{<p class="data-note">Yalnız henüz başlamamış sprintler listelenir. Aktif sprinte almak kapsam değişimidir; işi havuza alıp Backlog’daki “Aktif sprinte al” adımını kullanın.</p>}
}
@if(error){<p class="notice warn" role="alert">{{error}}</p>}
</div><footer><button data-modal-dismiss type="button" class="btn" [disabled]="saving" (click)="cancel.emit()">Vazgeç</button><button type="submit" class="btn primary" [disabled]="saving||loading">{{saving?'Oluşturuluyor…':'Tekrarla'}}</button></footer>
</form></div>`,
styles:[`h2{overflow-wrap:anywhere;margin:6px 0 0}.modal{max-width:560px}`]})
export class BacklogRepeatDialogComponent implements OnInit {
 @Input({required:true}) itemId!:string;@Input() title='';
 @Output() cancel=new EventEmitter<void>();@Output() repeated=new EventEmitter<string>();
 private api=inject(ApiService);private cdr=inject(ChangeDetectorRef);
 pool=POOL_CHOICE;target=POOL_CHOICE;targets:SprintTarget[]=[];loading=false;saving=false;error='';
 label=sprintOptionLabel;
 async ngOnInit(){this.loading=true;this.error='';this.cdr.detectChanges();
  try{this.targets=repeatTargets(await this.api.get<SprintSummary[]>('/sprints'));}
  catch(e){this.error=String(e);}
  finally{this.loading=false;this.cdr.detectChanges();}}
 async submit(){if(this.saving||this.loading)return;this.saving=true;this.error='';this.cdr.detectChanges();
  try{
   const result=await this.api.post<RepeatResult>(`/backlog/${encodeURIComponent(this.itemId)}/repeat`,{sprintId:this.target});
   this.repeated.emit(repeatSuccessMessage(result,this.targets.find(s=>s.id===this.target)?.name||''));
  }catch(e){this.error=String(e);}
  finally{this.saving=false;this.cdr.detectChanges();}}
}
