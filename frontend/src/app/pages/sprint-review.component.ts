import {SlackReviewSendComponent} from './slack-digest.component';
import {ReviewOperationsComponent} from './review-operations.component';
import {ReviewOperations} from './review-operations.model';
import {OvertimeTrendRow} from './operational-trends.model';
import {DefectSupportReviewComponent} from './defect-support-review.component';
import {ScopeSummaryComponent} from './scope-summary.component';
import { defectSummary } from '../defect-model';
import { Component, Input, OnChanges, signal, inject, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, TeamMember, ProductSettings, Sprint, SprintSummary, Task, formatDate, statusText } from '../api.service';
import { taskCategoryLabel, taskSubtypeLabel } from '../task-taxonomy';
import { buildReview, effort, isLeave, percent, REVIEW_STATUSES } from './review.model';
import {ReviewNotesComponent} from './review-notes.component';
import {downloadText} from './share-export';
import {SprintFlowComponent} from './sprint-flow.component';

@Component({
  selector: 'app-sprint-review', standalone: true, imports: [SlackReviewSendComponent,ReviewOperationsComponent,DefectSupportReviewComponent,ScopeSummaryComponent,FormsModule, RouterLink,ReviewNotesComponent,SprintFlowComponent],
  templateUrl: './sprint-review.component.html', styleUrl: './sprint-review.component.css',
})
export class SprintReviewComponent implements OnChanges {
  private api=inject(ApiService);private cdr=inject(ChangeDetectorRef);
  overtimeRows:OvertimeTrendRow[]=[];overtimeReady=false;operations:ReviewOperations|undefined;
  team:TeamMember[]=[];teamReady=false;teamError='';
  async loadTeam(){const id=this.sprint.id;this.teamReady=false;this.teamError='';this.team=[];try{const rows=await this.api.get<TeamMember[]>('/sprints/'+encodeURIComponent(id)+'/review-team');if(this.sprint.id===id){this.team=rows;this.teamReady=true;}}catch(e){if(this.sprint.id===id)this.teamError='Ekip bilgisi yüklenemedi; tekrar deneyin.';}finally{this.cdr.detectChanges();}}
  defectSummary=defectSummary;
  @Input({ required: true }) sprint!: Sprint;
  @Input({ required: true }) settings!: ProductSettings;
  model!: ReturnType<typeof buildReview>;
  notesReady=signal(false);private previousSprintId='';
  viewTime=new Intl.DateTimeFormat('tr-TR',{dateStyle:'medium',timeStyle:'short'}).format(new Date());
  query = signal(''); category = signal(''); status = signal('');
  readonly statusOptions = REVIEW_STATUSES;
  readonly percent = percent;
  readonly formatDate = formatDate;
  readonly statusText = statusText;
  readonly effort = effort;
  readonly isLeave = isLeave;
  ngOnChanges() { if(this.previousSprintId!==this.sprint.id){this.previousSprintId=this.sprint.id;this.notesReady.set(false);this.operations=undefined;this.overtimeReady=false;void this.loadTeam();}this.model = buildReview(this.sprint, this.settings); this.viewTime=new Intl.DateTimeFormat('tr-TR',{dateStyle:'medium',timeStyle:'short'}).format(new Date()); this.reset(); }
  reset() { this.query.set(''); this.category.set(''); this.status.set(''); }
  number(value: number) { return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(value); }
  taxonomy(task: Task) { return taskCategoryLabel(task.taskCategory) + (task.taskSubtype ? ' · ' + taskSubtypeLabel(task.taskSubtype) : ''); }
  estimate(task: Task) { const sizes: Record<string, string> = { SMALL: 'S', MEDIUM: 'M', LARGE: 'L', 'X-LARGE': 'XL' }; return this.settings.estimationMode === 'SIZE_AND_HOURS' ? (sizes[task.size || ''] || 'Size yok') : task.storyPoints == null ? 'SP yok' : `${task.storyPoints} SP`; }
  assignmentText(task: Task) { return task.assignments.map(member => `${member.memberName} (${isLeave(task) ? this.number(member.leaveDays || 0) + ' gün izin' : member.supportOnly ? 'X destek' : this.number(member.estimatedHours) + ' sa'})`).join(', ') || 'Atama yok'; }
  leaveHours(task: Task) { return task.assignments.reduce((sum, member) => sum + (member.leaveDays || 0)*(member.hoursPerDay??this.settings.hoursPerDay), 0); }
  get visibleTasks() { const query = this.query().trim().toLocaleLowerCase('tr-TR'); return this.model.items.filter(task => (!this.category() || task.taskCategory === this.category()) && (!this.status() || task.status === this.status()) && (!query || `${task.name} ${task.statusNote} ${task.assignments.map(member => member.memberName).join(' ')}`.toLocaleLowerCase('tr-TR').includes(query))); }
  print() { if(this.notesReady()&&this.overtimeReady)window.print(); }

  sharing=false;shareError='';
  async share() {
    if(!this.teamReady||!this.overtimeReady||this.sharing)return;
    const sprint=this.sprint,settings=this.settings,team=this.team;
    this.sharing=true;this.shareError='';
    try{
      const all=await this.api.get<SprintSummary[]>('/sprints');
      const next=all.filter(s=>s.number>sprint.number).sort((a,b)=>a.number-b.number||a.id.localeCompare(b.id))[0];
      const nextSprint=next?await this.api.get<Sprint>('/sprints/'+encodeURIComponent(next.id)):null;
      if(this.sprint.id!==sprint.id)return;
      const {editorialSprintHtml}=await import('./presentation-html');
      downloadText(editorialSprintHtml(sprint,settings,new Date().toISOString(),team,nextSprint,this.overtimeRows,this.operations),'text/html;charset=utf-8',`sprint-${sprint.number}-ozet.html`);
    }catch{if(this.sprint.id===sprint.id)this.shareError='Sonraki sprint bilgisi alınamadı. HTML oluşturulmadı; tekrar deneyin.';}
    finally{this.sharing=false;this.cdr.detectChanges();}
  }
}
