import { FoldDirective } from '../fold.directive';
import {ChangeDetectorRef,Component,EventEmitter,Input,OnChanges,OnDestroy,Output,inject} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ApiService} from '../api.service';
import {AuthService} from '../auth.service';
import {ModalAccessibilityDirective} from '../modal-accessibility.directive';

type NoteField='demoNotes'|'stakeholderFeedback'|'decisions'|'nextSteps';
interface ReviewNotes {sprintId:string;demoNotes:string;stakeholderFeedback:string;decisions:string;nextSteps:string;version:number;updatedAt:string|null;updatedBy:string|null}
@Component({selector:'app-review-notes',standalone:true,imports: [FoldDirective,FormsModule,ModalAccessibilityDirective],templateUrl:'./review-notes.component.html',styleUrl:'./review-notes.component.css'})
export class ReviewNotesComponent implements OnChanges,OnDestroy {
  @Input({required:true}) sprintId='';
  @Output() readyChange=new EventEmitter<boolean>();
  auth=inject(AuthService);private api=inject(ApiService);private cdr=inject(ChangeDetectorRef);
  notes:ReviewNotes|null=null;draft:ReviewNotes|null=null;latest:ReviewNotes|null=null;
  loading=true;saving=false;comparing=false;error='';formError='';message='';
  private epoch=0;private alive=true;
  fields:{key:NoteField;label:string;hint:string}[]=[
    {key:'demoNotes',label:'Demo notları',hint:'Gösterilen özellikler, senaryolar ve gözlemler'},
    {key:'stakeholderFeedback',label:'Paydaş geri bildirimleri',hint:'Alınan görüşler ve beklentiler'},
    {key:'decisions',label:'Alınan kararlar',hint:'Üzerinde uzlaşılan kapsam ve öncelikler'},
    {key:'nextSteps',label:'Sonraki adımlar',hint:'Takip edilecek işler; gerekiyorsa kişi ve tarih belirtin'},
  ];
  ngOnChanges(){this.draft=null;this.latest=null;this.notes=null;this.message='';this.saving=false;this.comparing=false;void this.load();}
  ngOnDestroy(){this.alive=false;++this.epoch;}
  private current(epoch:number,id:string){return this.alive&&epoch===this.epoch&&id===this.sprintId;}
  private refresh(){if(this.alive){this.cdr.detectChanges();this.readyChange.emit(!!this.notes&&!this.loading&&!this.error&&!this.draft);}}
  async load(){const epoch=++this.epoch,id=this.sprintId;this.loading=true;this.error='';this.readyChange.emit(false);try{const result=await this.api.get<ReviewNotes>('/sprints/'+encodeURIComponent(id)+'/review-notes');if(this.current(epoch,id))this.notes=result;}catch(e){if(this.current(epoch,id))this.error=String(e);}finally{if(this.current(epoch,id)){this.loading=false;this.refresh();}}}
  open(){if(!this.notes||!this.auth.isAdmin())return;this.draft={...this.notes};this.latest=null;this.formError='';this.message='';this.refresh();}
  close(){if(this.saving)return;this.draft=null;this.latest=null;this.formError='';this.refresh();void this.load();}
  changed(){this.refresh();}
  get dirty(){return !!this.draft&&!!this.notes&&this.fields.some(f=>this.draft![f.key]!==this.notes![f.key]);}
  stamp(note:ReviewNotes){if(!note.updatedAt)return 'Henüz not kaydedilmedi';const date=new Date(note.updatedAt);return 'Sürüm '+note.version+' · '+note.updatedBy+' · '+(Number.isNaN(date.getTime())?note.updatedAt:new Intl.DateTimeFormat('tr-TR',{dateStyle:'medium',timeStyle:'short'}).format(date));}
  async save(){if(!this.draft||this.saving||this.comparing||this.latest||!this.dirty)return;const epoch=this.epoch,id=this.sprintId,payload={...this.draft};this.saving=true;this.formError='';this.refresh();try{const result=await this.api.put<ReviewNotes>('/sprints/'+encodeURIComponent(id)+'/review-notes',payload);if(this.current(epoch,id)){this.notes=result;this.draft=null;this.message='Review notları kaydedildi.';}}catch(e){if(this.current(epoch,id))this.formError=String(e);}finally{if(this.current(epoch,id)){this.saving=false;this.refresh();}}}
  async compare(){if(this.comparing||this.saving||!this.draft)return;const epoch=this.epoch,id=this.sprintId;this.comparing=true;this.refresh();try{const result=await this.api.get<ReviewNotes>('/sprints/'+encodeURIComponent(id)+'/review-notes');if(this.current(epoch,id)&&this.draft){this.latest=result;this.formError='';}}catch(e){if(this.current(epoch,id))this.formError=String(e);}finally{if(this.current(epoch,id)){this.comparing=false;this.refresh();}}}
  useLatest(){if(!this.latest)return;this.notes=this.latest;this.draft={...this.latest};this.latest=null;this.formError='';this.refresh();}
  keepDraft(){if(!this.latest||!this.draft)return;this.notes=this.latest;this.draft={...this.draft,version:this.latest.version};this.latest=null;this.formError='';this.refresh();}
}
