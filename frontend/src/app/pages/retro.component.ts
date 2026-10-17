import {Component,Input,OnChanges,OnDestroy,inject,ChangeDetectorRef} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {RouterLink} from '@angular/router';
import {ApiService,Retro,RetroAction,TeamMember,BacklogItem,ProductSettings,TaskCategory,TaskSubtype,formatDate,statusText} from '../api.service';
import {AuthService} from '../auth.service';
import {TASK_CATEGORIES,availableSubtypes,defaultTaskSubtype} from '../task-taxonomy';

@Component({selector:'app-retro',standalone:true,imports:[FormsModule,RouterLink],templateUrl:'./retro.component.html',styleUrl:'./retro.component.css'})
export class RetroComponent implements OnChanges,OnDestroy {
 @Input({required:true}) sprintId='';
 auth=inject(AuthService);private api=inject(ApiService);private cdr=inject(ChangeDetectorRef);
 private epoch=0;private alive=true;loading=true;saving=false;error='';message='';
 notes:Retro={sprintId:'',workedWell:'',improve:'',actions:''};
 actions:RetroAction[]=[];members:TeamMember[]=[];backlog:BacklogItem[]=[];
 settings:ProductSettings={estimationMode:'SIZE_AND_HOURS',hoursPerDay:8};
 query='';statusFilter='';ownerFilter='';lateOnly=false;
 formOpen=false;editing:RetroAction|null=null;linking:RetroAction|null=null;
 draft={title:'',description:'',ownerId:'',dueDate:'',status:'OPEN' as RetroAction['status'],backlogId:''};
 backlogDraft={taskCategory:'DEV' as TaskCategory,taskSubtype:null as TaskSubtype,size:'',storyPoints:null as number|null,estimatedHours:0};
 statuses=[{value:'OPEN',label:'Açık'},{value:'IN_PROGRESS',label:'Devam ediyor'},{value:'DONE',label:'Tamamlandı'},{value:'CANCELLED',label:'Vazgeçildi'}];
 categories=TASK_CATEGORIES;formatDate=formatDate;statusText=statusText;
 ngOnChanges(){this.formOpen=false;this.linking=null;this.editing=null;this.saving=false;this.query='';this.statusFilter='';this.ownerFilter='';this.lateOnly=false;this.message='';void this.load();}
 ngOnDestroy(){this.alive=false;++this.epoch;}
 refresh(){if(this.alive)this.cdr.detectChanges();}
 private current(epoch:number,id:string){return this.alive&&epoch===this.epoch&&id===this.sprintId;}
 async load(){
   const epoch=++this.epoch,id=this.sprintId;this.loading=true;this.error='';
   try{
     const [notes,actions,members,backlog,settings]=await Promise.all([this.api.get<Retro>(`/sprints/${encodeURIComponent(id)}/retro`),this.api.get<RetroAction[]>(`/sprints/${encodeURIComponent(id)}/retro/actions`),this.api.get<TeamMember[]>('/team'),this.api.get<BacklogItem[]>('/backlog'),this.api.get<ProductSettings>('/settings')]);
     if(this.current(epoch,id)){this.notes=notes;this.actions=actions;this.members=members;this.backlog=backlog;this.settings=settings;}
   }catch(e){if(this.current(epoch,id))this.error=String(e);}finally{if(this.current(epoch,id)){this.loading=false;this.refresh();}}
 }
 get today(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
 openStatus(a:RetroAction){return a.status==='OPEN'||a.status==='IN_PROGRESS';}
 overdue(a:RetroAction){return this.openStatus(a)&&!!a.dueDate&&a.dueDate<this.today;}
 count(status:string){return this.actions.filter(a=>a.status===status).length;}
 get overdueCount(){return this.actions.filter(a=>this.overdue(a)).length;}
 get unownedCount(){return this.actions.filter(a=>this.openStatus(a)&&!a.ownerId).length;}
 get filtered(){const q=this.query.trim().toLocaleLowerCase('tr-TR');return this.actions.filter(a=>(!q||(a.title+' '+a.description+' '+(a.ownerName||'')+' '+(a.backlogTitle||'')).toLocaleLowerCase('tr-TR').includes(q))&&(!this.statusFilter||a.status===this.statusFilter)&&(!this.ownerFilter||(this.ownerFilter==='unassigned'?!a.ownerId:a.ownerId===this.ownerFilter))&&(!this.lateOnly||this.overdue(a)));}
 get ownerOptions(){return this.members.filter(m=>!!m.active||m.id===this.editing?.ownerId);}
 get subtypeOptions(){return availableSubtypes(this.backlogDraft.taskCategory);}
 statusLabel(value:string){return this.statuses.find(s=>s.value===value)?.label||value;}
 resetFilters(){this.query='';this.statusFilter='';this.ownerFilter='';this.lateOnly=false;this.refresh();}
 open(action?:RetroAction){if(this.loading||this.saving)return;this.editing=action||null;this.draft=action?{title:action.title,description:action.description,ownerId:action.ownerId||'',dueDate:action.dueDate||'',status:action.status,backlogId:action.backlogId||''}:{title:'',description:'',ownerId:'',dueDate:'',status:'OPEN',backlogId:''};this.formOpen=true;this.error='';this.message='';this.refresh();}
 abandonAndReload(){if(this.saving)return;this.formOpen=false;this.linking=null;void this.load();}
 close(){if(this.saving)return;this.formOpen=false;this.linking=null;this.error='';this.refresh();}
 async saveNotes(){
   if(this.loading||this.saving||!this.auth.isAdmin())return;const id=this.sprintId,epoch=this.epoch;this.saving=true;this.error='';
   try{const notes=await this.api.put<Retro>(`/sprints/${encodeURIComponent(id)}/retro`,this.notes);if(this.current(epoch,id)){this.notes=notes;this.message='Retro notları kaydedildi.';}}
   catch(e){if(this.current(epoch,id))this.error=String(e);}finally{if(this.current(epoch,id)){this.saving=false;this.refresh();}}
 }
 async save(){
   if(this.saving||!this.auth.isAdmin())return;const id=this.sprintId,epoch=this.epoch;this.saving=true;this.error='';
   const path=`/sprints/${encodeURIComponent(id)}/retro/actions`;const body={...this.draft,ownerId:this.draft.ownerId||null,dueDate:this.draft.dueDate||null,backlogId:this.draft.backlogId||null,version:this.editing?.version};
   try{const action=this.editing?await this.api.put<RetroAction>(path+'/'+encodeURIComponent(this.editing.id),body):await this.api.post<RetroAction>(path,body);
     if(this.current(epoch,id)){this.actions=[action,...this.actions.filter(a=>a.id!==action.id)];this.formOpen=false;this.message='Retro aksiyonu kaydedildi.';}}
   catch(e){if(this.current(epoch,id))this.error=String(e);}finally{if(this.current(epoch,id)){this.saving=false;this.refresh();}}
 }
 openBacklog(action:RetroAction){if(this.saving)return;this.linking=action;this.error='';this.backlogDraft={taskCategory:'DEV',taskSubtype:null,size:'',storyPoints:null,estimatedHours:0};this.refresh();}
 categoryChanged(category:TaskCategory){this.backlogDraft.taskCategory=category;this.backlogDraft.taskSubtype=defaultTaskSubtype(category);this.refresh();}
 async createBacklog(){
   if(!this.linking||this.saving||!this.auth.isAdmin())return;
   const id=this.sprintId,epoch=this.epoch,action=this.linking;this.saving=true;this.error='';
   try{const result=await this.api.post<RetroAction>(`/sprints/${encodeURIComponent(id)}/retro/actions/${encodeURIComponent(action.id)}/backlog`,{...this.backlogDraft,version:action.version});
     if(this.current(epoch,id)){this.actions=this.actions.map(a=>a.id===result.id?result:a);this.linking=null;this.message='Backlog işi oluşturuldu ve aksiyona bağlandı. Henüz sprinte alınmadı.';const backlog=await this.api.get<BacklogItem[]>('/backlog');if(this.current(epoch,id))this.backlog=backlog;}}
   catch(e){if(this.current(epoch,id))this.error=String(e);}finally{if(this.current(epoch,id)){this.saving=false;this.refresh();}}
 }
}
