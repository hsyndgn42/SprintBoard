import {Component,Input,Output,EventEmitter,OnChanges,inject,ChangeDetectorRef} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ApiService,Sprint,Task} from '../api.service';
@Component({selector:'app-overtime-task-picker',standalone:true,imports:[FormsModule],template:`
<label class="field">Mesainin ilgili olduğu görev<select [ngModel]="value" (ngModelChange)="valueChange.emit($event)" [ngModelOptions]="{standalone:true}" [disabled]="loading||!sprintId" aria-label="Mesai görevi"><option value="">Genel / göreve bağlanmadı</option>@for(t of tasks;track t.id){<option [value]="t.id">{{t.name}}</option>}</select></label>
@if(loading){<small>Görevler yükleniyor…</small>}@if(error){<p role="alert" class="notice warn">{{error}}</p>}
<small>Görev seçilirse mevcut Roadmap bağlantısı mesai kaydında saklanır. Genel kayıtlar Roadmap’e dağıtılmaz.</small>`,
styles:[`:host{display:block;min-width:0}select{width:100%;max-width:100%}small{display:block;color:#64748b;font-size:12px;line-height:1.5;margin-top:6px}`]})
export class OvertimeTaskPickerComponent implements OnChanges{
 @Input()sprintId='';@Input()memberId='';@Input()assignedOnly=false;@Input()value='';@Output()valueChange=new EventEmitter<string>();
 private api=inject(ApiService);private cdr=inject(ChangeDetectorRef);private generation=0;tasks:Task[]=[];loading=false;error='';
 async ngOnChanges(changes:any){if(!changes.sprintId&&!changes.memberId&&!changes.assignedOnly)return;const gen=++this.generation;this.tasks=[];this.error='';if(!changes.sprintId?.firstChange)this.valueChange.emit('');if(!this.sprintId){this.loading=false;return;}this.loading=true;
 try{const s=await this.api.get<Sprint>('/sprints/'+encodeURIComponent(this.sprintId));if(gen!==this.generation)return;this.tasks=s.items.filter(t=>t.workKind!=='LEAVE'&&t.taskSubtype!=='LEAVE'&&(!this.assignedOnly||t.assignments.some(a=>a.memberId===this.memberId)));}
 catch{if(gen===this.generation)this.error='Görevler alınamadı. Sprinti yeniden seçin.';}finally{if(gen===this.generation){this.loading=false;this.cdr.detectChanges();}}}
}
