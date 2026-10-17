import {Component,Input,OnChanges,OnDestroy,inject,ChangeDetectorRef} from '@angular/core';
import {RouterLink} from '@angular/router';
import {ApiService,formatDate,statusText} from '../api.service';
interface HistoryEvent {id:string;at:string;date:string;actor:string;kind:string;message:string;from:string;to:string;note:string}
interface Attempt {taskId:string;sprintId:string;sprintName:string;start:string;end:string;frozen:boolean;status:string;statusNote:string;hours?:number;events:HistoryEvent[]}
interface HistoryRecord {id:string;title:string;state:string;repeatOfId:string|null;missingParent:boolean;attempts:Attempt[]}
@Component({standalone:true,selector:'app-backlog-history',imports:[RouterLink],template:`
<section class="backlog-history" aria-label="İş geçmişi"><div class="history-heading"><h3>İş geçmişi</h3><button class="btn small" [disabled]="loading" (click)="load()">Yenile</button></div>
@if(loading){<p role="status">İş geçmişi yükleniyor…</p>}@else if(error){<p class="notice warn" role="alert">{{error}}</p>}@else{
 <p class="data-note">Önceki sprint sonuçları korunur; devam / tekrar işleri bağlantılı ayrı kayıtlardır.</p>
 @for(record of records;track record.id){<article class="history-record" [class.current]="record.id===itemId">
   <header><strong>{{record.title}}</strong>@if(record.id===itemId){<small class="history-selected">Seçili iş</small>}<span class="status">{{record.state==='Ready'?'Havuzda':statusText(record.state)}}</span></header>
   @if(record.repeatOfId){<small>Önceki kaydın devamı / tekrarı</small>}
   @if(record.missingParent){<p class="data-note">Önceki kaydın bağlantısı var, ancak kayıt mevcut veride bulunamadı.</p>}
   @for(attempt of record.attempts;track attempt.taskId){<div class="history-attempt"><div class="history-heading"><a class="table-link" [routerLink]="['/sprints',attempt.sprintId,'planning']">{{attempt.sprintName}} →</a><span class="status" [class.done]="attempt.status==='done'" [class.undone]="attempt.status==='undone'">{{attempt.status==='removed'?'Backlog’a geri döndü':attempt.status==='unknown'?'Sonuç kaydı yok':statusText(attempt.status)}}</span></div><small>{{formatDate(attempt.start)}} – {{formatDate(attempt.end)}}@if(attempt.frozen){ · Sabit kapanış kaydı}</small>
     @if(attempt.statusNote){<p class="history-note">{{attempt.statusNote}}</p>}
     @if(attempt.events.length){<details><summary>Görev günlüğü · {{attempt.events.length}} hareket</summary><ol class="history-events">@for(event of attempt.events;track event.id){<li><strong>{{label(event.kind)}}</strong><small>{{formatDate(event.date)}} · {{time(event.at)}} · {{event.actor}}</small>@if(event.from||event.to){<p>{{event.kind==='title-changed'?event.from:statusText(event.from)}} → {{event.kind==='title-changed'?event.to:statusText(event.to)}}</p>}@if(event.message){<p>{{event.message}}</p>}@if(event.note){<p>{{event.note}}</p>}</li>}</ol></details>}
     @else{<p class="data-note">Bu görev için kayıtlı işlem günlüğü yok; geçmiş hareketler sonradan üretilmez.</p>}
   </div>}@empty{<p class="data-note">Kayıtlı sprint geçmişi yok.</p>}
 </article>}
}
</section>`,styles:[`
:host{display:block}.backlog-history{margin-top:24px;border-top:1px solid #dce5f0;padding-top:14px}.history-heading{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}.history-heading h3{margin:0}.history-record{margin-top:16px;padding:16px;border:1px solid #dde6f1;border-radius:12px}.history-record.current{border-color:#98bbed;background:#f8fbff}.history-record header{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.history-record header strong{flex:1;min-width:150px;overflow-wrap:anywhere}.history-selected{color:#1565c0;font-weight:700}.history-record small{display:block;color:#60758e;font-size:12px;line-height:1.6}.history-attempt{border-left:3px solid #c8d9ed;margin-top:16px;padding:0 0 0 14px}.history-note,.history-events p{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;line-height:1.65}.history-events{list-style:none;padding:0}.history-events li{padding:12px 0;border-bottom:1px solid #e4ebf4}.history-events p{margin:6px 0}.history-events strong,summary{font-size:13px}summary{cursor:pointer;margin-top:12px;font-weight:600}.data-note{font-size:12px;line-height:1.6;color:#60758e}
`]})
export class BacklogHistoryComponent implements OnChanges,OnDestroy {
 @Input({required:true})itemId!:string;private api=inject(ApiService);private cdr=inject(ChangeDetectorRef);private version=0;private destroyed=false;
 records:HistoryRecord[]=[];loading=false;error='';statusText=statusText;formatDate=formatDate;
 ngOnChanges(){void this.load();}ngOnDestroy(){this.destroyed=true;this.version++;}
 async load(){const v=++this.version;this.loading=true;this.error='';this.records=[];try{const data=await this.api.get<{records:HistoryRecord[]}>('/backlog/'+encodeURIComponent(this.itemId)+'/history');if(v===this.version)this.records=data.records;}catch(e){if(v===this.version)this.error=String(e);}finally{if(v===this.version)this.loading=false;if(!this.destroyed)this.cdr.detectChanges();}}
 label(kind:string){return ({WORK_NOTE:'Çalışma notu','title-changed':'Görev adı değişti','status-changed':'Durum değişikliği',BLOCKED:'Engel bildirildi',UNBLOCKED:'Engel çözüldü','assignments-replaced':'Atamalar değişti','taxonomy-changed':'İş tipi değişti','added-to-sprint':'Sprinte eklendi','removed-from-sprint':'Backlog’a geri gönderildi','sprint-closed':'Sprint kapatıldı','reserve-linked':'Defect efor kaynağı değişti'} as Record<string,string>)[kind]||'İşlem kaydı';}
 time(value:string){return new Intl.DateTimeFormat('tr-TR',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Istanbul'}).format(new Date(value));}
}
