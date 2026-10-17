import {Component,Input,Output,EventEmitter,OnChanges,inject,ChangeDetectorRef} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ApiService,OvertimeEntry} from '../api.service';
@Component({selector:'app-overtime-plan-picker',standalone:true,imports:[FormsModule],template:`
<label class="field">Mesai türü<select aria-label="Mesai plan durumu" [ngModel]="mode" (ngModelChange)="chooseMode($event)" [ngModelOptions]="{standalone:true}" [disabled]="loading||!memberId||!sprintId"><option value="">Planlı / plansız seçin</option><option value="PLANNED">Plan kapsamında</option><option value="UNPLANNED">Plansız mesai</option></select></label>
@if(mode==='PLANNED'){
<label class="field">İlgili mesai planı<select aria-label="İlgili mesai planı" [ngModel]="planId" (ngModelChange)="choosePlan($event)" [ngModelOptions]="{standalone:true}"><option value="">Plan seçin</option>@for(p of plans;track p.id){<option [value]="p.id">{{p.plannedHours}} sa · {{p.taskTitle||p.note||'Genel mesai planı'}}{{taskId&&p.taskId===taskId?' · Görev eşleşiyor':''}}</option>}</select></label>
@if(!loading&&!plans.length){<p>Bu kişi ve sprint için mesai planı bulunamadı.</p>}
@if(selected;as p){@if(p.taskId&&p.taskId!==taskId){<p class="notice warn">Görev seçilen planla uyuşmuyor. Planı yeniden seçin veya mesaiyi plansız olarak işaretleyin.</p>}<div class="plan-preview"><span>Planlanan <b>{{p.plannedHours}} sa</b></span><span>Gerçekleşen <b>{{p.planActualHours||0}} → {{actualAfter}} sa</b></span><span>Onay sonrası kalan <b>{{remaining}} sa</b></span><span>Onay sonrası aşan <b>{{excess}} sa</b></span></div>}
} @else if(mode==='UNPLANNED'){<p class="data-note">{{hours}} saat plansız gerçekleşen mesai olarak kaydedilir; kapasite ve görev eforu artmaz.</p>}
@if(loading){<p>Mesai planları yükleniyor…</p>}@if(error){<p class="notice warn" role="alert">{{error}}</p><button type="button" class="btn small" (click)="load()">Yeniden dene</button>}
`,styles:[`:host{display:block;min-width:0}.field+.field{margin-top:12px}.plan-preview{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:14px;background:#f3f6fb;border-radius:10px;margin-top:12px}.plan-preview b{display:block;margin-top:5px}select{max-width:100%;width:100%}@media(max-width:500px){.plan-preview{grid-template-columns:1fr}}`]})
export class OvertimePlanPickerComponent implements OnChanges{
 @Input()memberId='';@Input()sprintId='';@Input()taskId='';@Input()hours=0;@Input()mode='';@Input()planId='';
 @Output()modeChange=new EventEmitter<string>();@Output()planIdChange=new EventEmitter<string>();@Output()taskSelected=new EventEmitter<string>();@Output()validChange=new EventEmitter<boolean>();
 private api=inject(ApiService);private cdr=inject(ChangeDetectorRef);private generation=0;plans:OvertimeEntry[]=[];loading=false;error='';
 get selected(){return this.plans.find(p=>p.id===this.planId)}
 get actualAfter(){return Math.round(((this.selected?.planActualHours||0)+this.hours)*100)/100}
 get remaining(){return Math.max(0,Math.round(((this.selected?.plannedHours||0)-this.actualAfter)*100)/100)}
 get excess(){return Math.max(0,Math.round((this.actualAfter-(this.selected?.plannedHours||0))*100)/100)}
 ngOnChanges(c:any){if(c.memberId||c.sprintId)void this.load();else this.validate()}
 validate(){this.validChange.emit(!this.loading&&!this.error&&(this.mode==='UNPLANNED'||this.mode==='PLANNED'&&!!this.selected&&(!this.selected.taskId||this.selected.taskId===this.taskId)))}
 chooseMode(mode:string){this.mode=mode;this.modeChange.emit(mode);this.planId='';this.planIdChange.emit('');this.validate()}
 choosePlan(id:string){this.planId=id;this.planIdChange.emit(id);if(this.selected?.taskId){this.taskId=this.selected.taskId;this.taskSelected.emit(this.taskId)}this.validate()}
 async load(){const gen=++this.generation;this.loading=true;this.error='';this.plans=[];this.chooseMode('');try{if(this.memberId&&this.sprintId){const rows=await this.api.get<OvertimeEntry[]>('/overtime/entries');if(gen===this.generation)this.plans=rows.filter(p=>p.memberId===this.memberId&&p.sprintId===this.sprintId&&p.plannedHours>0);}}catch{if(gen===this.generation)this.error='Planlar alınamadı; onay vermeden önce yeniden deneyin.'}finally{if(gen===this.generation){this.loading=false;this.validate();this.cdr.detectChanges()}}}
}
