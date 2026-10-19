import {Component,Input,inject,ChangeDetectorRef,OnInit,OnDestroy} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ApiService} from '../api.service';
import {AuthService} from '../auth.service';
import {downloadText} from './share-export';
interface DigestRun {id:string;source:string;sprintName:string;channelId:string;state:string;createdAt:string;updatedAt:string;message:string;actor:string}
interface DigestStatus {enabled:boolean;channelId:string;sendTime:string;weekends:boolean;version:number;nextSendAt:string;schedulerEnabled:boolean;history:DigestRun[]}
const endpoint='/admin/slack/digest';
export const digestState=(s:string)=>({SUCCESS:'Gönderildi',FAILED:'Hata',UNCERTAIN:'Teyit edilemedi',SKIPPED:'Atlandı',STARTED:'Hazırlanıyor',PUBLISHING:'Gönderiliyor'} as Record<string,string>)[s]||s;
@Component({selector:'app-slack-review-send',standalone:true,template:`
 @if(auth.isAdmin()){
 <button class="btn" [disabled]="busy" (click)="open()">{{busy?'Gönderiliyor…':'Slack’e gönder'}}</button>
 @if(confirm){<div class="notice" role="group" aria-label="Slack gönderim onayı"><p><strong>{{sprintName||'Aktif sprint'}}</strong> güncel özeti ve Review HTML’i <strong>{{channel}}</strong> kanalına gönderilsin mi?</p><p>Günlük otomatik gönderimden bağımsızdır. Kişi bazlı mesai saatleri ve sprint izin günleri HTML’de paylaşılır. İzin nedenleri ve hakediş bakiyeleri paylaşılmaz.</p><div class="actions"><button class="btn" [disabled]="busy" (click)="cancel()">Vazgeç</button><button class="btn primary" [disabled]="busy" (click)="send()">Özeti ve HTML’i gönder</button></div></div>}
 @if(message){<p role="status">{{message}}</p>}@if(error){<p class="notice warn" role="alert">{{error}}</p>}
 }`,styles:[`:host{display:block}.actions{display:flex;gap:10px;flex-wrap:wrap}.notice{max-width:640px;margin-top:10px}.notice p strong{display:inline}`]})
export class SlackReviewSendComponent {
 @Input() sprintId='';@Input() sprintName='';auth=inject(AuthService);private api=inject(ApiService);private cdr=inject(ChangeDetectorRef);
 busy=false;confirm=false;channel='';message='';error='';private requestId='';private selectedSprint='';
 cancel(){if(this.busy)return;this.confirm=false;this.cdr.detectChanges();}
 async open(){if(this.busy||!this.auth.isAdmin())return;this.busy=true;this.error='';this.message='';try{const s=await this.api.get<DigestStatus>(endpoint);this.channel=s.channelId;this.selectedSprint=this.sprintId;this.requestId=crypto.randomUUID();this.confirm=true;}catch{this.error='Slack gönderim ayarları alınamadı.';}finally{this.busy=false;this.cdr.detectChanges();}}
 async send(){if(this.busy||!this.confirm)return;if(this.selectedSprint!==this.sprintId){this.confirm=false;return;}this.busy=true;this.error='';this.cdr.detectChanges();try{const s=await this.api.post<DigestStatus>(endpoint+'/send',{sprintId:this.selectedSprint,requestId:this.requestId,channelId:this.channel});const run=s.history.find(r=>r.id==='manual:'+this.requestId);this.message=run?digestState(run.state)+': '+run.message:'Gönderim kaydı alındı; Ayarlar’dan durumu kontrol edin.';this.confirm=false;}catch{this.error='Yanıt alınamadı. Aynı isteği tekrar deneyebilir veya Ayarlar’daki gönderim kaydını kontrol edebilirsiniz.';}finally{this.busy=false;this.cdr.detectChanges();}}
}
@Component({selector:'app-slack-digest-settings',standalone:true,imports:[FormsModule,SlackReviewSendComponent],template:`
 <details class="digest" open><summary>Günlük sprint özeti · Slack</summary>
 @if(state){<form (ngSubmit)="save()"><div class="fields"><label class="check"><input type="checkbox" name="enabled" [(ngModel)]="enabled"> Günlük gönderim açık</label><label class="field">Kanal ID<input name="channel" [(ngModel)]="channel" required pattern="[CG][A-Z0-9]{5,30}" placeholder="C0CA4QFAU49"></label><label class="field">Gönderim saati · Türkiye<input type="time" name="time" [(ngModel)]="time" required></label><label class="check"><input type="checkbox" name="weekends" [(ngModel)]="weekends"> Hafta sonu da gönder</label></div><div class="actions settings-save-actions"><button class="btn primary" type="submit" [disabled]="busy">Gönderim ayarlarını kaydet</button><button class="btn" type="button" [disabled]="busy" (click)="preview()">HTML önizle / indir</button><button class="btn ui-refresh" type="button" [disabled]="busy" (click)="load(true)">Yenile</button></div></form>
 <p>Her gönderim: o anki sprint özeti + Review HTML. Saat dilimi: Europe/Istanbul. Servis kapalıysa açıldığı günün geciken gönderimi yapılır; önceki günler gönderilmez.</p>
 <div class="schedule"><strong>Sonraki otomatik gönderim</strong><span>{{date(state.nextSendAt)||'Kapalı'}}</span></div>
 <app-slack-review-send />
 <h4>Son 10 gönderim</h4><div class="history">@for(run of state.history;track run.id){<article><div><strong>{{run.sprintName||'Aktif sprint yok'}}</strong><span>{{label(run.state)}}</span></div><small>{{date(run.createdAt)}} · {{run.source==='AUTO'?'Otomatik':('Manuel · '+run.actor)}} · {{run.channelId}}</small><p>{{run.message}}</p></article>}@empty{<p>Henüz gönderim yok.</p>}</div>
 }@else{<p>Gönderim ayarları yükleniyor…</p>}@if(message){<p role="status">{{message}}</p>}@if(error){<p class="notice warn" role="alert">{{error}}</p>}
 </details>`,styles:[`:host{display:block;margin-top:24px}.digest{border:1px solid #dce5ee;border-radius:14px;padding:20px}summary{font-weight:750;cursor:pointer;font-size:18px;margin-bottom:18px}.fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}label{display:grid;gap:8px}input:not([type=checkbox]){width:100%;min-height:42px;border:1px solid #cddbea;border-radius:9px;padding:10px 12px;font:inherit;color:inherit;background:#fff}.check{display:flex;align-items:center;gap:10px}.check input{width:auto}.actions{display:flex;flex-wrap:wrap;gap:10px;margin:20px 0}.schedule{display:flex;gap:18px;flex-wrap:wrap;background:#eff5ff;border-radius:10px;padding:16px;margin:18px 0}.history article{border-top:1px solid #dce5ee;padding:12px 0}.history article>div{display:flex;justify-content:space-between;gap:15px}.history p{margin:5px 0}small{color:#627788}@media(max-width:650px){.fields{grid-template-columns:1fr}}`]})
export class SlackDigestSettingsComponent implements OnInit,OnDestroy {
 private api=inject(ApiService);private cdr=inject(ChangeDetectorRef);private timer?:ReturnType<typeof setInterval>;private destroyed=false;
 state:DigestStatus|null=null;enabled=false;channel='';time='08:00';weekends=true;version=0;busy=false;error='';message='';label=digestState;
 async ngOnInit(){await this.load(true);if(!this.destroyed)this.timer=setInterval(()=>{if(!this.busy&&!document.hidden)void this.load(false);},15000);}
 ngOnDestroy(){this.destroyed=true;clearInterval(this.timer);}
 date(value:string){return value?new Intl.DateTimeFormat('tr-TR',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Istanbul'}).format(new Date(value)):'';}
 private apply(s:DigestStatus,fields:boolean){this.state=s;if(fields){this.enabled=s.enabled;this.channel=s.channelId;this.time=s.sendTime;this.weekends=s.weekends;this.version=s.version;}}
 private refresh(){if(!this.destroyed)this.cdr.detectChanges();}
 async load(fields:boolean){try{this.apply(await this.api.get<DigestStatus>(endpoint),fields);}catch{this.error='Gönderim durumu alınamadı.';}finally{this.refresh();}}
 async save(){if(this.busy)return;this.busy=true;this.error='';this.message='';try{this.apply(await this.api.put<DigestStatus>(endpoint,{enabled:this.enabled,channelId:this.channel,sendTime:this.time,weekends:this.weekends,version:this.version}),true);this.message='Günlük gönderim ayarları kaydedildi.';}catch(e){this.error=String(e);}finally{this.busy=false;this.refresh();}}
 async preview(){if(this.busy)return;this.busy=true;this.error='';try{const p=await this.api.get<{html:string;filename:string}>(endpoint+'/preview');downloadText(p.html,'text/html;charset=utf-8',p.filename);}catch(e){this.error=String(e);}finally{this.busy=false;this.refresh();}}
}
