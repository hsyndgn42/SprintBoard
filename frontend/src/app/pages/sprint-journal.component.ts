import { FoldDirective } from '../fold.directive';
import { ListPagerComponent } from '../list-pager.component';
import {Component,Input,OnChanges,OnDestroy,ChangeDetectorRef,inject} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ApiService,Sprint,statusText,formatDate} from '../api.service';
import {AuthService} from '../auth.service';
interface Activity {id:string;taskId:string;taskTitle:string;actor:string;memberName:string;date:string;createdAt:string;kind:string;message:string;details:{from?:string;to?:string;reason?:string;note?:string;assignments?:{memberName:string;estimatedHours:number;supportOnly:boolean}[];previousAssignments?:{memberName:string;estimatedHours:number;supportOnly:boolean}[];taskCategory?:string;taskSubtype?:string}}
@Component({standalone:true,selector:'app-sprint-journal',imports: [FoldDirective,ListPagerComponent,FormsModule],styleUrl:'./collaboration.css',template:`
<details appFold class="card card-pad journal">
 <summary class="section-head"><div><span class="eyebrow">EKİBİN ÇALIŞMA GEÇMİŞİ</span><h2>{{focusTask?'Görev günlüğü':'Sprint günlüğü'}}</h2></div><button class="btn small" [disabled]="loading||busy" (click)="load()">Yenile</button></summary>
 <p class="data-note">Notlar ve görev değişiklikleri giriş yapan tüm kullanıcılar tarafından görülür. Geçmiş kayıtlar değiştirilmez; düzeltme için yeni not ekleyin.</p>
 @if(writable.length){<details class="journal-compose"><summary>+ Günlük çalışma notu</summary><form (ngSubmit)="save()" class="form-grid">
 <label class="field">Görev<select name="journalTask" [(ngModel)]="taskId" required><option value="">Görev seçin</option>@for(t of writable;track t.id){<option [value]="t.id">{{t.name}}</option>}</select></label>
 <label class="field">Çalışma günü<input name="journalDate" type="date" [(ngModel)]="date" [min]="sprint.start" [max]="latestDate" required></label>
 <label class="field">Bugün ne yaptın?<textarea name="journalMessage" [(ngModel)]="message" rows="4" maxlength="2000" required placeholder="İlerleme, alınan karar veya karşılaşılan engel…"></textarea></label>
 <div class="journal-actions"><small>{{message.length}} / 2000</small><button class="btn primary" [disabled]="busy||!taskId||!message.trim()">{{busy?'Kaydediliyor…':'Günlüğe ekle'}}</button></div>
 </form></details>}
 @if(success){<p class="notice" role="status">{{success}}</p>}@if(error){<p class="notice warn" role="alert">{{error}}</p>}
 <div class="journal-filters"><label class="field">Gün<input type="date" [(ngModel)]="dayFilter"></label><label class="field">Kişi<select [(ngModel)]="actorFilter"><option value="">Tüm kişiler</option>@for(p of people;track p.actor){<option [value]="p.actor">{{p.name}}</option>}</select></label><label class="field">Kayıt<select [(ngModel)]="kindFilter"><option value="">Notlar ve işlemler</option><option value="notes">Çalışma notları</option><option value="changes">İşlem geçmişi</option></select></label>@if(!focusTask){<label class="field">Görev ara<input [(ngModel)]="query" type="search" placeholder="Görev adı"></label>}</div>
 @if(loading){<p role="status">Günlük yükleniyor…</p>}@else{
 <app-list-pager #dayPager [items]="groups" label="Günlük günleri" />@for(group of dayPager.rows;track group.date){<details appFold class="journal-day"><summary><h3>{{formatDate(group.date)}}</h3></summary><app-list-pager #entryPager [items]="group.rows" label="Günlük kayıtları" />@for(row of entryPager.rows;track row.id){<article class="journal-entry" [class.work-note]="row.kind==='WORK_NOTE'"><div class="journal-entry-head"><strong>{{row.memberName}}</strong><time>{{time(row.createdAt)}}</time></div><small>{{row.actor}} · {{label(row.kind)}}</small>@if(!focusTask){<h4>{{row.taskTitle}}</h4>}@if(row.message){<p class="journal-text">{{row.message}}</p>}@if(row.details.from||row.details.to){<p>{{row.kind==='title-changed'?row.details.from:statusText(row.details.from||'')}} → {{row.kind==='title-changed'?row.details.to:statusText(row.details.to||'')}}</p>}@if(row.details.note||row.details.reason){<p class="journal-text">{{row.details.note||row.details.reason}}</p>}@if(row.details.assignments){<details><summary>Atama değişikliği · {{row.details.assignments.length}} kişi</summary><strong>Önce</strong>@for(a of row.details.previousAssignments||[];track $index){<p>{{a.memberName}} · {{a.supportOnly?\'X destek\':a.estimatedHours+\' saat\'}}</p>}@empty{<p>Atama yok</p>}<strong>Sonra</strong>@for(a of row.details.assignments;track $index){<p>{{a.memberName}} · {{a.supportOnly?\'X destek\':a.estimatedHours+\' saat\'}}</p>}@empty{<p>Atama yok</p>}</details>}@if(row.details.taskCategory){<p>{{row.details.taskCategory}} · {{row.details.taskSubtype}}</p>}</article>}</details>}
 @empty{<div class="empty">Bu kapsamda günlük kaydı yok. Eski sprintlere geriye dönük işlem geçmişi üretilmez.</div>}}
</details>`})
export class SprintJournalComponent implements OnChanges,OnDestroy{
 @Input({required:true})sprint!:Sprint;@Input()focusTask='';private api=inject(ApiService);auth=inject(AuthService);private cdr=inject(ChangeDetectorRef);
 rows:Activity[]=[];loading=true;busy=false;error='';success='';taskId='';date='';message='';dayFilter='';actorFilter='';kindFilter='';query='';private version=0;private destroyed=false;
 formatDate=formatDate;statusText=statusText;
 get today(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Istanbul'}).format(new Date());}
 get latestDate(){return this.sprint.end&&this.sprint.end<this.today?this.sprint.end:this.today;}
 get writable(){return this.sprint.status==='active'&&!this.sprint.closureFrozen?this.sprint.items.filter(t=>(!this.focusTask||t.id===this.focusTask)&&t.workKind!=='LEAVE'&&t.taskSubtype!=='LEAVE'&&this.auth.canWork(t)):[];}
 ngOnChanges(){this.rows=[];this.taskId=this.focusTask||'';this.date=this.latestDate;this.message='';this.success='';void this.load();}
 ngOnDestroy(){this.destroyed=true;this.version++;}
 update(){if(!this.destroyed)this.cdr.detectChanges();}
 async load(){const version=++this.version;this.loading=true;this.error='';try{const rows=await this.api.get<Activity[]>('/sprints/'+encodeURIComponent(this.sprint.id)+'/journal');if(version===this.version)this.rows=rows;}catch(e){if(version===this.version)this.error=String(e);}finally{if(version===this.version)this.loading=false;this.update();}}
 get scoped(){return this.rows.filter(r=>!this.focusTask||r.taskId===this.focusTask);}
 get people(){return [...new Map(this.scoped.map(r=>[r.actor,{actor:r.actor,name:r.memberName}])).values()];}
 get groups(){const q=this.query.trim().toLocaleLowerCase('tr');const groups=new Map<string,Activity[]>();for(const r of this.scoped.filter(r=>(!this.dayFilter||r.date===this.dayFilter)&&(!this.actorFilter||r.actor===this.actorFilter)&&(!this.kindFilter||(this.kindFilter==='notes'?r.kind==='WORK_NOTE':r.kind!=='WORK_NOTE'))&&(!q||r.taskTitle.toLocaleLowerCase('tr').includes(q))))groups.set(r.date,[...(groups.get(r.date)||[]),r]);return [...groups].map(([date,rows])=>({date,rows}));}
 label(kind:string){return ({WORK_NOTE:'Çalışma notu','title-changed':'Görev adı değişti','status-changed':'Durum değişikliği',BLOCKED:'Engel bildirildi',UNBLOCKED:'Engel çözüldü','assignments-replaced':'Atamalar değişti','taxonomy-changed':'İş tipi değişti','added-to-sprint':'Sprinte eklendi','removed-from-sprint':'Sprintten çıkarıldı','sprint-closed':'Sprint kapatıldı'} as Record<string,string>)[kind]||kind;}
 time(value:string){return new Intl.DateTimeFormat('tr-TR',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Istanbul'}).format(new Date(value));}
 async save(){if(this.busy||!this.taskId||!this.message.trim())return;this.busy=true;this.error='';this.success='';this.update();try{await this.api.post('/self/tasks/'+encodeURIComponent(this.taskId)+'/notes',{date:this.date,message:this.message});this.message='';this.success='Not sprint günlüğüne eklendi.';await this.load();}catch(e){this.error=String(e);}finally{this.busy=false;this.update();}}
}
