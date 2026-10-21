import {Component,ChangeDetectorRef,inject,OnInit,OnDestroy} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ApiService} from '../api.service';
interface Run {ID:string;STATE:string;MESSAGE:string;CHANNEL_ID:string;CREATED_AT:string;PERIOD_START?:string;PERIOD_END?:string;KIND?:string;SCANNED?:number;MATCHED?:number;}
interface Weekly {enabled:boolean;weekday:number;sendTime:string;version:number;channelId:string;listening:boolean;workerEnabled:boolean;nextSendAt:string;history:Run[];}
interface History {workerEnabled:boolean;listening:boolean;initialLookbackDays:number;history:Run[];}
@Component({selector:'app-slack-automation',standalone:true,imports:[FormsModule],template:`
 <details class="section-fold card card-pad" data-section="slack-weekly">
  <summary><div><span class="eyebrow">PAZARTESİ · 09:00 VARSAYILAN</span><h3>Haftalık mesai ve hakediş raporu</h3></div></summary>
  <div class="content">
   @if(weekly){
    <p>Önceki Pazartesi–Pazar döneminin kişi bazlı mesaisi, mesaiden izin kullanımı ve güncel hakediş bakiyesi. Mesaj ve HTML raporu kayıtlı mesai kanalına gider.</p>
    <div class="fields">
     <label class="field">Otomatik gönderim<select [(ngModel)]="draft.enabled"><option [ngValue]="true">Açık</option><option [ngValue]="false">Kapalı</option></select></label>
     <label class="field">Gün<select [(ngModel)]="draft.weekday">@for(day of days;track $index){<option [ngValue]="$index+1">{{day}}</option>}</select></label>
     <label class="field">Saat · Türkiye<input type="time" [(ngModel)]="draft.sendTime"></label>
     <label class="field">Mesai kanalı<input readonly [value]="weekly.channelId||'Önce bağlantı ayarlarından kaydedin'"></label>
    </div>
    <div class="actions"><button class="btn primary" [disabled]="busy" (click)="save()">Rapor ayarlarını kaydet</button><button class="btn" [disabled]="busy" (click)="preview()">HTML önizle</button><button class="btn" [disabled]="busy||!weekly.channelId||!weekly.listening" (click)="openConfirm()">Şimdi gönder</button><button class="btn ui-refresh" [disabled]="busy" (click)="load(true)">Yenile</button></div>
    <p>Sonraki gönderim: <strong>{{date(weekly.nextSendAt)}}</strong></p>
    @if(!weekly.listening||!weekly.workerEnabled){<p class="notice warn">Slack dinlemesi/arka plan işçisi kapalı; otomatik gönderim bekliyor.</p>}
    @if(confirm){<div class="notice"><p><strong>{{confirm.channelId}}</strong> kanalına önceki tamamlanmış haftanın kişi bazlı mesai ve izin bilgileri gönderilecek. Kanal üyeleri bu bilgileri görebilir.</p><div class="actions"><button class="btn" [disabled]="busy" (click)="confirm=null">Vazgeç</button><button class="btn primary" [disabled]="busy" (click)="send()">Onayla ve gönder</button></div></div>}
    <details><summary>Son gönderimler ({{weekly.history.length}})</summary><div class="table-wrap"><table><thead><tr><th scope="col">Dönem</th><th scope="col">Zaman</th><th scope="col">Durum</th></tr></thead><tbody>@for(r of weekly.history;track r.ID){<tr><td>{{r.PERIOD_START}} – {{r.PERIOD_END}}</td><td>{{date(r.CREATED_AT)}}</td><td>{{state(r.STATE)}}<small>{{r.MESSAGE}}</small></td></tr>}@empty{<tr><td colspan="3">Henüz gönderim yok.</td></tr>}</tbody></table></div></details>
   }
  </div>
 </details>
 <details class="section-fold card card-pad" data-section="slack-history">
  <summary><div><span class="eyebrow">MESAJ KURTARMA</span><h3>Geçmiş mesajları tara</h3></div></summary>
  <div class="content">
   <p>Defect, mesai ve backlog kanalları dinleme açıkken otomatik taranır. İlk kez son 7 gün, sonrasında son tamamlanan taramadan itibaren devam edilir. Aynı Slack mesajı ikinci kayıt oluşturmaz.</p>
   <p>Yalnız şablonla başlayan ana mesajlar alınır. Hatalı mesajlar düzeltme için onay kuyruğunda kalır. Kanalda silinmiş veya Slack saklama süresi dolmuş mesajlar geri getirilemez.</p>
   <div class="fields"><label class="field">Başlangıç<input type="date" [(ngModel)]="from"></label><label class="field">Bitiş · dahil<input type="date" [(ngModel)]="to"></label></div>
   <div class="actions"><button class="btn primary" [disabled]="busy||!history?.listening" (click)="scan()">Geçmiş mesajları tara</button><button class="btn ui-refresh" [disabled]="busy" (click)="load(false)">Yenile</button></div>
   <p class="hint">En fazla 91 günlük aralık; daha eski dönemleri ayrı tarayın. Slack sınırlarına göre sayfa sayfa ilerler. Eşleşen sayısı daha önce alınan mesajları da içerir; yeni kayıt sayısı değildir.</p>
   @if(history){<details><summary>Son taramalar ({{history.history.length}})</summary><div class="table-wrap"><table><thead><tr><th scope="col">Kanal / tür</th><th scope="col">Zaman</th><th scope="col">Okunan / eşleşen</th><th scope="col">Durum</th></tr></thead><tbody>@for(r of history.history;track r.ID){<tr><td>{{r.CHANNEL_ID}}<small>{{r.KIND}}</small></td><td>{{date(r.CREATED_AT)}}</td><td>{{r.SCANNED}} / {{r.MATCHED}}</td><td>{{state(r.STATE)}}<small>{{r.MESSAGE}}</small></td></tr>}@empty{<tr><td colspan="4">Henüz tarama yok.</td></tr>}</tbody></table></div></details>}
  </div>
 </details>
 @if(error){<p class="notice warn" role="alert">{{error}}</p>}@if(message){<p class="inline-success" role="status">{{message}}</p>}
 `,styles:[`:host{display:block;margin-top:24px;scroll-margin-top:100px}.section-fold>summary h3{font-size:18px;margin:6px 0 0}.content{padding:0}.fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px}.actions{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}.ui-refresh{margin-left:auto}small{display:block;margin-top:5px;color:#60788e}p{line-height:1.6}.section-fold+ .section-fold{margin-top:20px}td{vertical-align:top}`]})
export class SlackAutomationComponent implements OnInit,OnDestroy {
 private api=inject(ApiService);private cdr=inject(ChangeDetectorRef);private timer?:ReturnType<typeof setInterval>;private destroyed=false;private loading=false;
 weekly:Weekly|null=null;history:History|null=null;draft={enabled:true,weekday:1,sendTime:'09:00',version:0};days=['Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi','Pazar'];busy=false;error='';message='';confirm:{channelId:string;requestId:string}|null=null;
 from=this.localDay(-7);to=this.localDay(0);private scanRequest='';private scanRange='';
 private localDay(offset:number){const now=new Date();now.setDate(now.getDate()+offset);return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
 async ngOnInit(){await this.load(true);if(!this.destroyed)this.timer=setInterval(()=>{if(!document.hidden&&!this.busy)void this.load(false);},15000);}
 ngOnDestroy(){this.destroyed=true;clearInterval(this.timer);}
 private refresh(){if(!this.destroyed)this.cdr.detectChanges();}
 date(value:string){return value?new Date(value).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'}):'Planlanmadı';}
 state(value:string){return ({SUCCESS:'Başarılı',PENDING:'Sırada / taranıyor',RETRY:'Yeniden denenecek',CANCELLED:'Durduruldu',FAILED:'Hata',UNCERTAIN:'Kanalı kontrol edin',STARTED:'Hazırlanıyor',PUBLISHING:'Gönderiliyor'} as Record<string,string>)[value]||value;}
 async load(reset:boolean){if(this.loading||this.busy)return;this.loading=true;try{const [w,h]=await Promise.all([this.api.get<Weekly>('/admin/slack/weekly'),this.api.get<History>('/admin/slack/history')]);this.weekly=w;this.history=h;if(reset)this.draft={enabled:w.enabled,weekday:w.weekday,sendTime:w.sendTime,version:w.version};}catch(e){this.error=String(e);}finally{this.loading=false;this.refresh();}}
 private async run(action:()=>Promise<void>){if(this.busy)return;this.busy=true;this.error='';this.message='';this.refresh();try{await action();}catch(e){this.error=String(e);}finally{this.busy=false;this.refresh();}}
 save(){return this.run(async()=>{this.weekly=await this.api.put<Weekly>('/admin/slack/weekly',this.draft);this.draft.version=this.weekly.version;this.message='Haftalık rapor ayarları kaydedildi.';});}
 openConfirm(){if(this.weekly)this.confirm={channelId:this.weekly.channelId,requestId:crypto.randomUUID()};}
 send(){return this.run(async()=>{if(!this.confirm)return;const request=this.confirm;this.weekly=await this.api.post<Weekly>('/admin/slack/weekly/send',request);this.confirm=null;const result=this.weekly.history.find(r=>r.ID==='manual:'+request.requestId);if(result?.STATE==='SUCCESS')this.message='Mesai raporu gönderildi.';else this.error=result?.MESSAGE||'Gönderim durumunu geçmişten kontrol edin.';});}
 scan(){return this.run(async()=>{const range=this.from+':'+this.to;if(!this.scanRequest||this.scanRange!==range){this.scanRequest=crypto.randomUUID();this.scanRange=range;}this.history=await this.api.post<History>('/admin/slack/history/scan',{from:this.from,to:this.to,requestId:this.scanRequest});this.scanRequest='';this.message='Tarama sıraya alındı. Mesajlar otomatik onaylanmaz; mevcut onay ekranlarına alınır.';});}
 preview(){return this.run(async()=>{const report=await this.api.get<{html:string;from:string}>('/admin/slack/weekly/preview');const url=URL.createObjectURL(new Blob([report.html],{type:'text/html;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='mesai-'+report.from+'.html';link.click();setTimeout(()=>URL.revokeObjectURL(url),5000);this.message='HTML önizlemesi indirildi; Slack’e gönderilmedi.';});}
}
