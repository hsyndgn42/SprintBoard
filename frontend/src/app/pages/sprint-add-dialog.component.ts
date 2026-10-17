import { ModalAccessibilityDirective } from '../modal-accessibility.directive';
import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, BacklogItem, ProductSettings, RoadmapItem, Sprint, TeamMember, TaskCategory } from '../api.service';
import { TASK_CATEGORIES, availableSubtypes, defaultTaskSubtype } from '../task-taxonomy';

@Component({selector:'app-sprint-add-dialog',standalone:true,imports:[ModalAccessibilityDirective,FormsModule],template:`
<div class="modal-layer"><form class="modal" (ngSubmit)="submit()" aria-labelledby="add-ready-title">
<header><h2 id="add-ready-title">Sprinte iş ekle</h2><p>Yeni işin backlog bağlantısı otomatik oluşturulur.</p></header>
<div class="modal-body form-grid">
@if(!backlogId){<div class="mode-switch" aria-label="İş kaynağı"><button type="button" class="btn" [class.primary]="mode==='existing'" [disabled]="saving" (click)="setMode('existing')">Backlog’dan seç</button><button type="button" class="btn" [class.primary]="mode==='new'" [disabled]="saving" (click)="setMode('new')">Yeni iş oluştur</button></div>}
@if(loading){<p role="status">Yükleniyor…</p>}
@if(mode==='existing'){
 @if(!backlogId){<label class="field">Backlog işi<select name="backlogChoice" [ngModel]="selectedId" (ngModelChange)="select($event)" [disabled]="saving"><option value="">İş seçin</option>@for(option of options;track option.id){<option [value]="option.id">{{option.title}}</option>}</select></label>}
 @if(item;as current){<h3>{{current.title}}</h3><p class="data-note">{{current.estimatedHours}} saat tahmin · {{current.roadmapTitle||'Roadmap hedefine bağlı değil'}}</p>
 @if(!current.readiness.eligible){<p class="notice warn">Bu iş artık havuzda değil.</p>}
 @else if(!current.readiness.ready){<section class="notice warn"><strong>Hazırlık kontrolü</strong><ul>@for(warning of current.readiness.warnings;track $index){<li>{{warning}}</li>}</ul></section><label class="check"><input type="checkbox" name="ack" [(ngModel)]="acknowledged" (ngModelChange)="changed()"><span>Uyarıları değerlendirdim; bu işi sprinte almak istiyorum.</span></label>}}
 <p class="data-note">Mevcut backlog işinin kişi atamalarını Planlama’dan yapabilirsiniz.</p>
}@else{
 <label class="field">İş adı<input name="newTitle" [(ngModel)]="draft.title" required maxlength="300"></label>
 <label class="field">Kabul kriterleri / kapsam<textarea name="criteria" [(ngModel)]="draft.criteria" maxlength="10000" rows="3"></textarea></label>
 <div class="form-grid two"><label class="field">İş tipi<select name="category" [(ngModel)]="draft.taskCategory" (ngModelChange)="categoryChanged()">@for(c of categories;track c.value){<option [value]="c.value">{{c.label}}</option>}</select></label>
 <label class="field">Alt kırılım<select name="subtype" [(ngModel)]="draft.taskSubtype"><option value="">Alt kırılım yok</option>@for(s of subtypes;track s.value){<option [value]="s.value">{{s.label}}</option>}</select></label></div>
 <div class="form-grid two"><label class="field">Roadmap<select name="roadmap" [(ngModel)]="draft.roadmapId"><option value="">Roadmap hedefine bağlı değil</option>@for(r of roadmaps;track r.id){<option [value]="r.id">{{r.title}}</option>}</select></label>
 @if(settings.estimationMode==='SIZE_AND_HOURS'){<label class="field">Size<select name="size" [(ngModel)]="draft.size" required><option value="SMALL">Small</option><option value="MEDIUM">Medium</option><option value="LARGE">Large</option><option value="X-LARGE">X-Large</option></select></label>}@else{<label class="field">Story Point<input name="points" type="number" [(ngModel)]="draft.storyPoints" min="0.1" step="any" required></label>}</div>
 <label class="field">İşin tahmini eforu (saat)<input name="newHours" type="number" [(ngModel)]="draft.estimatedHours" min="0" max="10000" step="0.5" required></label>
 <fieldset class="assignments"><legend>Kişiler ve planlanan efor</legend>
 @for(p of people;track p.id){<div class="person"><label class="check"><input type="checkbox" [name]="'person-'+p.id" [(ngModel)]="p.selected" (ngModelChange)="changed()">{{p.name}}</label>
 @if(p.selected){<div class="person-effort"><select [attr.aria-label]="p.name+' atama türü'" [name]="'support-'+p.id" [(ngModel)]="p.supportOnly" (ngModelChange)="changed()"><option [ngValue]="false">Efor (saat)</option><option [ngValue]="true">X destek</option></select>@if(!p.supportOnly){<input type="number" [attr.aria-label]="p.name+' efor saat'" [name]="'hours-'+p.id" [(ngModel)]="p.hours" min="0" max="1000" step="0.5" required>}</div>}</div>}
 </fieldset><p class="data-note">Atanan toplam: {{assignedHours}} saat. Kapasite aşımı kaydı engellemez; planlamada görünür.</p>
 <label class="check"><input type="checkbox" name="newAcknowledged" [(ngModel)]="acknowledged" (ngModelChange)="changed()"><span>Kapsamı ve atamaları kontrol ettim; yeni işi doğrudan sprinte al.</span></label>
}
@if((mode==='new'?draft.taskCategory:item?.taskCategory)==='DEFECT'){<label class="field">Efor kaynağı<select name="reserveTask" [(ngModel)]="reserveTaskId"><option value="">Ek plan · rezerv kullanma</option>@for(r of reserves;track r.id){<option [value]="r.id">{{r.name}}</option>}</select><small>Aynı kişinin rezervinden karşılanır; aşan bölüm ek plan olur. Defectin durumu bağımsızdır.</small></label>}
@if(active&&(mode==='new'?draft.taskCategory:item?.taskCategory)!=='DEFECT'){<label class="check urgent"><input type="checkbox" name="emergency" [(ngModel)]="emergency" (ngModelChange)="changed()"><span><strong>Acil / plansız iş</strong><small>Sonradan eklenen her iş acil değildir. Bu seçim rapor ve Review’de ayrı gösterilir.</small></span></label>}
@if(active&&(mode==='new'?draft.taskCategory:item?.taskCategory)==='DEFECT'){<p class="data-note">Defect Support rezervinden karşılanan efor acil sayılmaz. Rezerv dışındaki / aşan ek efor Acil / plansız olarak gösterilir; X destek ve sıfır efor ek yük oluşturmaz.</p>}
<label class="field">{{active?'Sprinte alma gerekçesi':'Planlama notu'}}<textarea name="scopeReason" [(ngModel)]="scopeReason" maxlength="2000" rows="3" [required]="active" placeholder="Örn. üretim hatası nedeniyle sprint içinde geldi"></textarea></label>
@if(error){<p class="notice warn" role="alert">{{error}}</p>}
</div><footer><button data-modal-dismiss type="button" class="btn" [disabled]="saving" (click)="cancel.emit()">Vazgeç</button><button type="submit" class="btn primary" [disabled]="saving||loading||!canSubmit">{{saving?'Kaydediliyor…':mode==='new'?'Oluştur ve sprinte ekle':'Sprinte ekle'}}</button></footer>
</form></div>`,
styles:[`h3{overflow-wrap:anywhere;margin:0}.mode-switch{display:flex;gap:8px;flex-wrap:wrap}.check{display:flex;align-items:flex-start;gap:10px;font-size:13px;line-height:1.6}.check input{flex:none;margin-top:5px}.check small{display:block;color:#64748b}.urgent{padding:16px;border:1px solid #f0ceab;border-radius:12px;background:#fff9ef}.assignments{margin:0;padding:0 14px;border:1px solid #dce5f0;border-radius:12px;min-width:0}.assignments legend{font-size:13px;padding:0 6px}.person{display:grid;grid-template-columns:1fr 1fr;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid #edf1f7}.person:last-child{border:0}.person-effort{display:flex;gap:8px;min-width:0}.person-effort select,.person-effort input{min-height:42px;border:1px solid #cbdaf0;border-radius:10px;background:#fff;padding:9px 10px;color:#17324f;font:inherit;font-size:13px}.person-effort select:focus,.person-effort input:focus{outline:2px solid #97bfee;outline-offset:1px}.person-effort select{min-width:0;flex:1}.person-effort input{width:90px;min-width:0}li{overflow-wrap:anywhere}@media(max-width:550px){.person{grid-template-columns:1fr}.person-effort input{width:90px}}`]})
export class SprintAddDialogComponent implements OnChanges,OnDestroy {
 @Input({required:true}) sprintId!:string;@Input() backlogId='';
 @Output() cancel=new EventEmitter<void>();@Output() added=new EventEmitter<void>();
 private api=inject(ApiService);private cdr=inject(ChangeDetectorRef);private revision=0;private destroyed=false;
 options:BacklogItem[]=[];item:BacklogItem|null=null;selectedId='';acknowledged=false;loading=false;saving=false;error='';
 reserveTaskId='';reserves:Sprint['items']=[];
 mode:'new'|'existing'='existing';active=false;emergency=false;scopeReason='';
 settings:ProductSettings={estimationMode:'SIZE_AND_HOURS',hoursPerDay:8};roadmaps:RoadmapItem[]=[];
 people:{id:string;name:string;selected:boolean;hours:number;supportOnly:boolean}[]=[];
 categories=TASK_CATEGORIES;
 draft={title:'',criteria:'',taskCategory:'DEV' as TaskCategory,taskSubtype:'',roadmapId:'',size:'SMALL',storyPoints:1,estimatedHours:0};
 get subtypes(){return availableSubtypes(this.draft.taskCategory).filter(s=>s.value!=='LEAVE');}
 get assignedHours(){return this.people.reduce((n,p)=>n+(p.selected&&!p.supportOnly?Number(p.hours)||0:0),0);}
 get canSubmit(){return this.mode==='new'?this.acknowledged&&!!this.draft.title.trim():!!this.item?.readiness.eligible&&(this.item.readiness.ready||this.acknowledged);}
 changed(){if(!this.destroyed)this.cdr.detectChanges();}
 setMode(mode:'new'|'existing'){this.mode=mode;this.acknowledged=false;this.error='';this.changed();}
 categoryChanged(){this.draft.taskSubtype=defaultTaskSubtype(this.draft.taskCategory)||'';this.changed();}
 async ngOnChanges(){this.loading=true;this.error='';try{
 const [settings,sprint,team,roadmaps,backlog]=await Promise.all([this.api.get<ProductSettings>('/settings'),this.api.get<Sprint>('/sprints/'+encodeURIComponent(this.sprintId)),this.api.get<TeamMember[]>('/team'),this.api.get<RoadmapItem[]>('/roadmap'),this.api.get<BacklogItem[]>('/backlog')]);
 if(this.destroyed)return;this.reserves=sprint.items.filter(t=>t.taskCategory==='BAU'&&t.taskSubtype==='DEFECT_SUPPORT');this.settings=settings;this.active=sprint.status==='active';this.roadmaps=roadmaps;this.options=backlog.filter(b=>b.state==='Ready'&&!b.taskId);this.people=team.filter(p=>p.active).map(p=>({id:p.id,name:p.name,selected:false,hours:0,supportOnly:false}));
 if(this.backlogId)await this.select(this.backlogId);
 }catch(e){this.error=String(e);}finally{this.loading=false;this.changed();}}
 ngOnDestroy(){this.destroyed=true;this.revision++;}
 async select(id:string){const revision=++this.revision;this.selectedId=id;this.item=null;this.acknowledged=false;this.error='';this.loading=!!id;this.changed();if(!id)return;try{const item=await this.api.get<BacklogItem>('/backlog/'+encodeURIComponent(id)+'/readiness');if(revision===this.revision)this.item=item;}catch(e){if(revision===this.revision)this.error=String(e);}finally{if(revision===this.revision){this.loading=false;this.changed();}}}
 async submit(){if(this.saving||!this.canSubmit||this.loading)return;if(this.active&&!this.scopeReason.trim()){this.error='Sprinte alma gerekçesi gerekli.';this.changed();return;}this.saving=true;this.error='';this.changed();
 try{const common={reserveTaskId:(this.mode==='new'?this.draft.taskCategory:this.item?.taskCategory)==='DEFECT'?this.reserveTaskId:'',reason:this.scopeReason,emergency:this.active&&this.emergency,readinessAcknowledged:this.acknowledged};
 if(this.mode==='new')await this.api.post('/sprints/'+encodeURIComponent(this.sprintId)+'/tasks/new',{...this.draft,...common,assignments:this.people.filter(p=>p.selected).map(p=>({memberId:p.id,estimatedHours:p.supportOnly?0:p.hours,supportOnly:p.supportOnly}))});
 else await this.api.post('/sprints/'+encodeURIComponent(this.sprintId)+'/tasks',{...common,backlogId:this.item!.id,readinessFingerprint:this.item!.readiness.fingerprint});
 if(!this.destroyed)this.added.emit();
 }catch(e){this.error=String(e);}finally{this.saving=false;this.changed();}}
}
