import {ChangeDetectorRef,Component,Input,OnChanges,OnDestroy,inject} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {RouterLink} from '@angular/router';
import {ApiService,BacklogItem,RoadmapItem,ProductSettings} from '../api.service';
import {ListPagerComponent} from '../list-pager.component';
import {FoldDirective} from '../fold.directive';
import {ModalAccessibilityDirective} from '../modal-accessibility.directive';
import {SbStateComponent} from '../shared/sb-state.component';
import {BacklogHistoryComponent} from './backlog-history.component';
import {TASK_CATEGORIES,taskCategoryLabel,taskSubtypeLabel} from '../task-taxonomy';
import {emptyWorkFilters,roadmapWork,workAnalysis,workResult,resultLabel,stageLabel,STAGES,CountBar} from './roadmap-detail.model';

interface RoadmapEffort {
  id:string; assignedHours:number; overtimeHours:number; poolEstimatedHours:number;
  doneHours:number; undoneHours:number; openHours:number;
}
@Component({
  selector:'app-roadmap-detail',standalone:true,
  imports:[FormsModule,RouterLink,ListPagerComponent,FoldDirective,ModalAccessibilityDirective,SbStateComponent,BacklogHistoryComponent],
  templateUrl:'./roadmap-detail.component.html',styleUrl:'./roadmap-detail.component.css',
})
export class RoadmapDetailComponent implements OnChanges,OnDestroy {
  @Input({required:true}) roadmap!:RoadmapItem;
  @Input({required:true}) items:BacklogItem[]=[];
  @Input({required:true}) settings!:ProductSettings;
  private api=inject(ApiService);private cdr=inject(ChangeDetectorRef);
  private request=0;private selectedId='';
  filters=emptyWorkFilters();stages=STAGES;categories=TASK_CATEGORIES;
  visible:BacklogItem[]=[];analysis=workAnalysis([]);
  detail:BacklogItem|null=null;
  effort:RoadmapEffort|null=null;effortLoading=false;effortError='';
  workResult=workResult;resultLabel=resultLabel;stageLabel=stageLabel;
  ngOnChanges(){
    if(this.selectedId!==this.roadmap.id){this.filters=emptyWorkFilters();this.detail=null;this.selectedId=this.roadmap.id;}
    this.refreshFilters();void this.loadEffort();
  }
  ngOnDestroy(){this.request++;}
  refreshFilters(){this.visible=roadmapWork(this.items,this.roadmap.id,this.filters);this.analysis=workAnalysis(this.visible);}
  reset(){this.filters=emptyWorkFilters();this.refreshFilters();}
  get filtered(){return Object.values(this.filters).some(v=>v.trim());}
  get linkedCount(){return this.items.filter(i=>i.roadmapId===this.roadmap.id).length;}
  get sprints(){
    return [...new Map(this.items.filter(i=>i.roadmapId===this.roadmap.id&&i.sprintId)
      .map(i=>[i.sprintId!,{id:i.sprintId!,name:i.sprintName||'Sprint'}])).values()]
      .sort((a,b)=>a.name.localeCompare(b.name,'tr',{numeric:true}));
  }
  get charts(){return [
    {key:'result',title:'İşlerin sonuç dağılımı',rows:this.analysis.results},
    {key:'stage',title:'Planlama dağılımı',rows:this.analysis.stages},
    {key:'type',title:'İş tipi dağılımı',rows:this.analysis.types},
  ];}
  percent(value:number,total:number){return total>0 ? 100*value/total : 0;}
  num(value:number){return new Intl.NumberFormat('tr-TR',{maximumFractionDigits:1}).format(value);}
  color(row:CountBar,index:number,result:boolean){
    if(result)return ({done:'var(--sb-success)',undone:'var(--sb-danger)',doing:'var(--sb-info)',todo:'var(--sb-neutral-500)',planned:'var(--sb-viz-3)',pool:'var(--sb-viz-7)',unknown:'var(--sb-neutral-600)'} as Record<string,string>)[row.key];
    return 'var(--sb-viz-'+(index%8+1)+')';
  }
  taxonomy(item:BacklogItem){return taskCategoryLabel(item.taskCategory)+(item.taskSubtype?' · '+taskSubtypeLabel(item.taskSubtype):'');}
  estimate(item:BacklogItem){return this.settings.estimationMode==='SIZE_AND_HOURS' ? (item.size?'Size '+item.size:'Size yok') : (item.storyPoints==null?'SP yok':item.storyPoints+' SP');}
  async loadEffort(){
    const request=++this.request,id=this.roadmap.id;
    this.effort=null;this.effortLoading=true;this.effortError='';
    try{
      const rows=await this.api.get<RoadmapEffort[]>('/reports/roadmap');
      if(request!==this.request)return;
      this.effort=rows.find(r=>r.id===id)||null;
      if(!this.effort)this.effortError='Bu roadmap için efor verisi bulunamadı.';
    }catch(e){if(request===this.request)this.effortError=String(e);}
    finally{if(request===this.request){this.effortLoading=false;this.cdr.detectChanges();}}
  }
}
