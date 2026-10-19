import {SlackDigestSettingsComponent} from './slack-digest.component';
import {SlackAutomationComponent} from './slack-automation.component';
import {Component,ChangeDetectorRef,inject,OnInit,OnDestroy} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ApiService} from '../api.service';
interface SlackStatus {backlogChannelId:string;backlogTemplate:string;receiptPending?:number;receiptError?:string;overtimeChannelId:string;overtimeTemplate:string;reporterError?:string;teamId:string;channelId:string;template:string;version:number;state:string;error:string;botTokenConfigured:boolean;appTokenConfigured:boolean;lastReceivedAt:string}
@Component({selector:'app-slack-settings',standalone:true,imports:[FormsModule,SlackDigestSettingsComponent,SlackAutomationComponent],templateUrl:'./slack-settings.component.html',styleUrl:'./slack-settings.component.css'})
export class SlackSettingsComponent implements OnInit,OnDestroy {
 private api=inject(ApiService);private cdr=inject(ChangeDetectorRef);private timer?:ReturnType<typeof setInterval>;private destroyed=false;private loading=false;
 overtimeChannelId='';status:SlackStatus|null=null;teamId='';channelId='';template='';botToken='';appToken='';busy=false;error='';message='';confirmForget=false;private version=0;
 backlogChannelId='';backlogTemplate='';
 get stateLabel(){return ({STOPPED:'Durduruldu',CONNECTING:'Bağlanıyor…',CONNECTED:'Bağlı',RETRYING:'Yeniden bağlanıyor'} as Record<string,string>)[this.status?.state||'']||'Yükleniyor';}
 async ngOnInit(){await this.load(true);if(!this.destroyed)this.timer=setInterval(()=>{if(!document.hidden&&!this.busy)void this.load(false);},5000);}
 ngOnDestroy(){this.destroyed=true;clearInterval(this.timer);this.botToken='';this.appToken='';}
 private refresh(){if(!this.destroyed)this.cdr.detectChanges();}
 private apply(s:SlackStatus){this.status=s;this.teamId=s.teamId;this.channelId=s.channelId;this.overtimeChannelId=s.overtimeChannelId;this.backlogChannelId=s.backlogChannelId;this.backlogTemplate=s.backlogTemplate;this.template=s.template;this.version=s.version;}
 async load(initial:boolean){if(this.loading||this.busy)return;this.loading=true;try{const s=await this.api.get<SlackStatus>('/admin/slack');if(!this.busy){if(initial)this.apply(s);else this.status=s;}}catch{this.error='Slack ayarları alınamadı.';}finally{this.loading=false;this.refresh();}}
 async save(start:boolean){const data={teamId:this.teamId,channelId:this.channelId,overtimeChannelId:this.overtimeChannelId,backlogChannelId:this.backlogChannelId,backlogTemplate:this.backlogTemplate,template:this.template,version:this.version,botToken:this.botToken,appToken:this.appToken};this.botToken='';this.appToken='';await this.run(()=>start?this.api.post<SlackStatus>('/admin/slack/start',data):this.api.put<SlackStatus>('/admin/slack',data),start?'Ayarlar kaydedildi; bağlantı başlatılıyor.':'Ayarlar kaydedildi. Dinlemeyi başlatmak için Kaydet ve dinle seçin.');}
 async retryNames(){if(this.busy)return;this.busy=true;this.refresh();try{await this.api.post('/admin/slack/reporter-names/retry',{});this.message='Kişi adları arka planda alınacak. Kaydet ve dinle açık olmalı.';}catch(e){this.error=String(e);}finally{this.busy=false;this.refresh();}}
 async stop(){await this.run(()=>this.api.post<SlackStatus>('/admin/slack/stop',{}),'Dinleme durduruldu; tokenlar korunuyor.');}
 setForget(value:boolean){this.confirmForget=value;this.refresh();}
 async forget(){await this.run(()=>this.api.delete<SlackStatus>('/admin/slack/credentials'),'Tokenlar silindi; onay kuyruğu korundu.');this.confirmForget=false;this.refresh();}
 private async run(fn:()=>Promise<SlackStatus>,message:string){if(this.busy)return;this.busy=true;this.error='';this.message='';this.refresh();try{this.apply(await fn());this.message=message;}catch(e){this.error=String(e);}finally{this.busy=false;this.refresh();}}
}
