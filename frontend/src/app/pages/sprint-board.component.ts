import { ListPagerComponent } from '../list-pager.component';
import { isBau, effectiveTaskStatus } from '../task-lifecycle';
import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, Output, inject } from '@angular/core';
import { AuthService } from '../auth.service';
import { SprintJournalComponent } from './sprint-journal.component';
import { FormsModule } from '@angular/forms';
import { ApiService, ProductSettings, Sprint, Task, statusText } from '../api.service';
import { SprintFlowComponent } from './sprint-flow.component';
import { ModalAccessibilityDirective } from '../modal-accessibility.directive';
import { taskCategoryLabel, taskSubtypeLabel } from '../task-taxonomy';
import { defectSummary } from '../defect-model';
import { BOARD_COLUMNS, boardColor, boardMembers, emptyBoardFilters, filterBoard } from './board.model';

@Component({
  selector:'app-sprint-board',standalone:true,imports:[ListPagerComponent,SprintJournalComponent,FormsModule,ModalAccessibilityDirective,SprintFlowComponent],
  templateUrl:'./sprint-board.component.html',styleUrl:'./sprint-board.component.css',
})
export class SprintBoardComponent implements OnChanges,OnDestroy {
  private destroyed=false;ngOnDestroy(){this.destroyed=true;}
  @Input({required:true}) sprint!:Sprint;
  @Input({required:true}) settings!:ProductSettings;
  @Input() editable=false;
  @Input() busy=false;
  @Output() statusChange=new EventEmitter<{task:Task;status:string}>();
  @Output() updated=new EventEmitter<void>();
  auth=inject(AuthService);
  canTask(task:Task){return this.sprint.status==='active'&&!this.sprint.closureFrozen&&!isBau(task)&&this.auth.canWork(task);}
  private api=inject(ApiService); actionTask:Task|null=null;action:'block'|'unblock'|'remove'='block';reason='';actionError='';actionBusy=false;confirmed=false;onlyBlocked=false;onlyEmergency=false;replacementTaskId='';
  private cdr=inject(ChangeDetectorRef);
  private sprintId='';
  filters=emptyBoardFilters();
  selectedId:string|null=null;
  isBau=isBau; effectiveStatus=effectiveTaskStatus;
  get bauItems(){return this.items.filter(isBau);}
  columns=BOARD_COLUMNS;statusText=statusText;categoryLabel=taskCategoryLabel;subtypeLabel=taskSubtypeLabel;color=boardColor;defectSummary=defectSummary;
  ngOnChanges(){if(this.sprintId!==this.sprint.id){this.sprintId=this.sprint.id;this.filters=emptyBoardFilters();this.selectedId=null;this.actionTask=null;this.onlyBlocked=false;this.onlyEmergency=false;}}
  get items(){return filterBoard(this.sprint.items,this.filters).filter(t=>(!this.onlyBlocked||!isBau(t)&&t.blocker?.blocked)&&(!this.onlyEmergency||t.emergency));}
  get emergencyOptions(){return this.sprint.items.filter(t=>t.emergency&&t.id!==this.actionTask?.id);}
  get people(){return boardMembers(this.sprint.items);}
  get categories(){return [...new Set(this.sprint.items.map(t=>t.taskCategory))].sort();}
  get subtypes(){return [...new Set(this.sprint.items.filter(t=>!this.filters.category||t.taskCategory===this.filters.category).map(t=>t.taskSubtype).filter((t):t is string=>!!t))].sort((a,b)=>taskSubtypeLabel(a).localeCompare(taskSubtypeLabel(b),'tr'));}
  get filtered(){return this.onlyBlocked||this.onlyEmergency||Object.values(this.filters).some(Boolean);}
  get selected(){return this.sprint.items.find(t=>t.id===this.selectedId)||null;}
  get canEdit(){return this.editable&&this.sprint.status==='active'&&!this.sprint.closureFrozen;}
  get lanes(){const items=this.items;return this.columns.map(c=>({...c,items:items.filter(t=>!isBau(t)&&t.status===c.key),total:this.sprint.items.filter(t=>!isBau(t)&&t.status===c.key).length}));}
  changed(){if(!this.destroyed)this.cdr.detectChanges();}
  categoryChanged(){this.filters.subtype='';this.changed();}
  reset(){this.filters=emptyBoardFilters();this.onlyBlocked=false;this.onlyEmergency=false;this.changed();}
  open(item:Task){this.selectedId=item.id;this.changed();}
  close(){this.selectedId=null;this.changed();}
  startAction(task:Task,action:'block'|'unblock'|'remove'){if((action==='remove'?!this.removable(task):!this.canTask(task))||this.busy||this.actionBusy)return;this.selectedId=null;this.actionTask=task;this.action=action;this.reason='';this.replacementTaskId='';this.confirmed=false;this.actionError='';this.changed();}
  cancelAction(){if(this.actionBusy)return;this.actionTask=null;this.changed();}
  removable(task:Task){return this.canEdit&&task.status!=='done'&&!task.externalId?.startsWith('BAU-AUTO:');}
  async saveAction(){const task=this.actionTask;if(!task||this.actionBusy||!this.reason.trim()||this.action==='remove'&&!this.confirmed)return;this.actionBusy=true;this.actionError='';this.changed();try{
    if(this.action==='remove')await this.api.post('/tasks/'+encodeURIComponent(task.id)+'/remove',{reason:this.reason,confirmed:this.confirmed,fingerprint:task.flowFingerprint,replacementTaskId:this.replacementTaskId});
    else await this.api.put((this.auth.isAdmin()?'/tasks/':'/self/tasks/')+encodeURIComponent(task.id)+'/blocker',{reason:this.reason,blocked:this.action==='block',version:task.blocker?.version??0});
    if(!this.destroyed&&this.sprint.id===task.sprintId){this.actionTask=null;this.updated.emit();}
  }catch(e){if(this.sprint.id===task.sprintId)this.actionError=String(e);}finally{this.actionBusy=false;this.changed();}}
  selectStatus(task:Task,event:Event){const select=event.target as HTMLSelectElement;const status=select.value;select.value=task.status;if(status!==task.status)this.changeStatus(task,status);}
  changeStatus(task:Task,status:string){if(this.canTask(task)&&!this.busy)this.statusChange.emit({task,status});}
  estimate(item:Task){return this.settings.estimationMode==='SIZE_AND_HOURS'?(item.size?'Size '+({SMALL:'Small',MEDIUM:'Medium',LARGE:'Large','X-LARGE':'X-Large'}[item.size]):'Size belirtilmedi'):(item.storyPoints!=null?item.storyPoints+' SP':'SP belirtilmedi');}
  isLeave(item:Task){return item.workKind==='LEAVE'||item.taskSubtype==='LEAVE';}
  leaveHours(item:Task){return item.assignments.reduce((n,a)=>n+(a.leaveDays||0)*(a.hoursPerDay??this.settings.hoursPerDay),0);}
  assignedHours(item:Task){return item.assignments.reduce((n,a)=>n+(a.supportOnly?0:a.estimatedHours),0);}
}
