import {Component,ChangeDetectorRef,inject,input,output} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ApiService} from '../api.service';
export interface CorrectableSlackMessage {id:string;raw:string;originalRaw:string;fingerprint:string;status:string;correctedBy?:string;correctedAt?:string}
@Component({selector:'app-slack-message-correction',standalone:true,imports:[FormsModule],template:`
 <details class="source"><summary>Orijinal Slack mesajı</summary><pre>{{entry().originalRaw}}</pre></details>
 @if(entry().correctedAt){<p class="data-note">Düzelten: {{entry().correctedBy}} · {{time(entry().correctedAt!)}}</p><details class="source"><summary>Düzeltilmiş mesaj</summary><pre>{{entry().raw}}</pre></details>}
 @if(entry().status==='PENDING'||entry().status==='INVALID'){
  @if(!editing){<button class="btn small" [disabled]="disabled()" (click)="begin()">Mesajı düzelt</button>}
  @else{<div class="editor"><label class="field">Düzeltilmiş mesaj<textarea aria-label="Düzeltilmiş Slack mesajı" rows="8" maxlength="12000" [(ngModel)]="text" [disabled]="busy"></textarea></label>
   <p class="data-note">Güncel kanal şablonuna göre doğrulanır. Orijinal mesaj ve gönderen korunur; iş oluşturulması için ardından ayrıca onay vermeniz gerekir.</p>
   <div class="actions"><button class="btn primary" [disabled]="busy||!text.trim()" (click)="save()">Doğrula ve kaydet</button><button class="btn" [disabled]="busy" (click)="cancel()">Düzeltmeden vazgeç</button></div>
   @if(error){<p class="notice warn" role="alert">{{error}}</p>}
  </div>}
 }
 `,styles:[`:host{display:block;margin:14px 0}.source{margin:10px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f5f8fd;padding:14px;border-radius:8px}.editor{margin:14px 0}.actions{display:flex;flex-wrap:wrap;gap:8px}textarea{width:100%;box-sizing:border-box;min-width:0}.btn{white-space:normal}`]})
export class SlackMessageCorrectionComponent {
 private api=inject(ApiService);private cdr=inject(ChangeDetectorRef);
 entry=input.required<CorrectableSlackMessage>();endpoint=input.required<string>();disabled=input(false);
 editingChange=output<boolean>();saved=output<string>();editing=false;busy=false;text='';error='';
 time(value:string){return new Date(value).toLocaleString('tr-TR');}
 begin(){this.text=this.entry().raw;this.error='';this.editing=true;this.editingChange.emit(true);}
 cancel(){this.editing=false;this.error='';this.editingChange.emit(false);}
 async save(){if(this.busy)return;this.busy=true;this.error='';const p=this.entry();try{
  await this.api.post(this.endpoint()+'/'+encodeURIComponent(p.id)+'/correction',{text:this.text,fingerprint:p.fingerprint});
  this.editing=false;this.editingChange.emit(false);this.saved.emit(p.id);
 }catch(e){this.error=String(e);}finally{this.busy=false;this.cdr.detectChanges();}}
}
