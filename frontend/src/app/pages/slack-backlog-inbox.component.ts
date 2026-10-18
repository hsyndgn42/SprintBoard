import {Component,ChangeDetectorRef,inject,OnInit,OnDestroy,output} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {FoldDirective} from '../fold.directive';
import {ApiService,ProductSettings,RoadmapItem} from '../api.service';
import {SubtypeOption} from '../task-taxonomy';
interface Entry {id:string;valid:boolean;title:string;description:string;taskCategory:string;reporterName:string;receivedAt:string;raw:string;errors:string[];status:string;sourceUrl:string;decidedBy:string;decisionNote:string;backlogId:string}
interface Inbox {items:Entry[];total:number;pending:number}
@Component({selector:'app-slack-backlog-inbox',standalone:true,imports:[FormsModule,FoldDirective],templateUrl:'./slack-backlog-inbox.component.html',styleUrl:'./slack-backlog-inbox.component.css'})
export class SlackBacklogInboxComponent implements OnInit,OnDestroy {
 private api=inject(ApiService);private cdr=inject(ChangeDetectorRef);private timer?:ReturnType<typeof setInterval>;private destroyed=false;
 changed=output<void>();openItem=output<string>();data:Inbox={items:[],total:0,pending:0};filter='WAITING';page=0;selected:Entry|null=null;settings:ProductSettings|null=null;roadmap:RoadmapItem[]=[];subtypes:SubtypeOption[]=[];
 title='';description='';category='DEV';subtype='';size='';points:number|null=null;hours=0;roadmapId='';note='';busy=false;loading=false;error='';message='';categories=['DEV','DESIGN','ANALYZE','TEST','BAU'];
 get pages(){return Math.ceil(this.data.total/20);}get options(){return this.subtypes.filter(s=>s.category===this.category&&s.active&&s.code!=='LEAVE');}
 get ready(){return this.title.trim()&&this.description.trim()&&Number.isFinite(this.hours)&&this.hours>=0&&this.hours<=10000&&(!['TEST','BAU'].includes(this.category)||this.subtype)&&(this.settings?.estimationMode==='POINTS_AND_HOURS'?Number.isFinite(this.points)&&Number(this.points)>0:!!this.size);}
 label(s:string){return ({PENDING:'Admin onayı bekliyor',INVALID:'Format hatası',APPROVED:'Onaylandı',REJECTED:'Reddedildi'} as Record<string,string>)[s]||s;}
 time(s:string){return new Date(s).toLocaleString('tr-TR');}refresh(){if(!this.destroyed)this.cdr.detectChanges();}
 async ngOnInit(){await this.load();if(!this.destroyed)this.timer=setInterval(()=>{if(!document.hidden&&!this.busy&&!this.selected)void this.load();},15000);}
 ngOnDestroy(){this.destroyed=true;clearInterval(this.timer);}
 changeFilter(){this.page=0;this.selected=null;void this.load();}
 categoryChanged(){this.subtype='';this.refresh();}
 toggle(p:Entry){if(this.busy)return;if(this.selected?.id===p.id){this.selected=null;}else{this.selected=p;this.title=p.title;this.description=p.description;this.category=p.taskCategory;this.subtype='';this.size='';this.points=null;this.hours=0;this.roadmapId='';this.note='';this.error='';}this.refresh();}
 async load(){
  if(this.loading||this.busy)return;this.loading=true;const page=this.page,filter=this.filter;
  try{const [data,settings,roadmap,subtypes]=await Promise.all([this.api.get<Inbox>('/admin/slack/backlog-inbox?filter='+filter+'&page='+page),this.api.get<ProductSettings>('/settings'),this.api.get<RoadmapItem[]>('/roadmap'),this.api.get<SubtypeOption[]>('/task-subtypes')]);
   if(page===this.page&&filter===this.filter){this.data=data;this.settings=settings;this.roadmap=roadmap;this.subtypes=subtypes;this.page=Math.min(this.page,Math.max(0,Math.ceil(data.total/20)-1));}
  }catch(e){this.error=String(e);}finally{this.loading=false;this.refresh();if(page!==this.page||filter!==this.filter)void this.load();}
 }
 async decide(action:string){if(this.busy||!this.selected)return;this.busy=true;this.error='';this.message='';this.refresh();try{await this.api.post('/admin/slack/backlog-inbox/'+encodeURIComponent(this.selected.id)+'/decision',{action,title:this.title,description:this.description,taskCategory:this.category,taskSubtype:this.subtype,size:this.size,storyPoints:this.points,estimatedHours:this.hours,roadmapId:this.roadmapId,note:this.note});this.selected=null;this.message=action==='APPROVE'?'İstek onaylandı; backlog havuzunda yeni iş oluşturuldu.':'İstek reddedildi; iş oluşturulmadı.';this.changed.emit();}catch(e){this.error=String(e);}finally{this.busy=false;await this.load();this.refresh();}}
}
