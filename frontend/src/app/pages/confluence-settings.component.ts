import {Component,ChangeDetectorRef,inject,OnInit,OnDestroy} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ApiService} from '../api.service';

interface ConfluenceStatus {baseUrl:string;spaceKey:string;parentPageId:string;backlogPageId:string;enabled:boolean;version:number;patConfigured:boolean}
interface ConfluenceTestResult {connected:boolean;user:string;space?:string;spaceReachable?:boolean;spaceError?:string}

@Component({
 selector:'app-confluence-settings',
 standalone:true,
 imports:[FormsModule],
 template:`
 <section class="card card-pad" style="margin:18px 0">
  <div class="section-head"><div><span class="eyebrow">CONFLUENCE</span><h2>Wiki yayınlama</h2></div>
   @if(status){<span class="status" [class.done]="status.enabled">{{ status.enabled ? 'Açık' : 'Kapalı' }}</span>}</div>
  <p class="data-note">Sprint planları ve Backlog aynı bağlantıyı kullanır. İzin kayıtları ve kişisel izin bilgileri paylaşılmaz.</p>

  <div class="form-grid two">
   <label class="field">Confluence adresi<input name="confluenceUrl" [(ngModel)]="baseUrl" placeholder="https://wiki.sirket.local" autocomplete="off"></label>
   <label class="field">Alan (space) anahtarı<input name="confluenceSpace" [(ngModel)]="spaceKey" placeholder="VIBE" autocomplete="off"></label>
   <label class="field">Kişisel erişim tokenı<input name="confluencePat" type="password" [(ngModel)]="pat" [placeholder]="status?.patConfigured ? 'Kayıtlı · değiştirmek için yeni token girin' : 'Confluence kişisel erişim tokenı'" autocomplete="off"><small>Token tarayıcıya geri gönderilmez.</small></label>
  </div>
  <h3>Hedef sayfalar</h3>
  <div class="form-grid two">
   <label class="field">Sprint planları · Üst sayfa ID<input name="confluenceParent" [(ngModel)]="parentPageId" placeholder="Boş bırakılırsa alanın kökü" inputmode="numeric" autocomplete="off"><small>Her sprint için bu sayfanın altında bir plan sayfası oluşturulur; tekrar gönderimde güncellenir.</small></label>
   <label class="field">Backlog · Sayfa ID<input name="confluenceBacklog" [(ngModel)]="backlogPageId" placeholder="Örn. 123456789" inputmode="numeric" autocomplete="off"><small>Wiki’de Backlog için ayrı bir sayfa açıp adresindeki pageId değerini girin. Gönderim bu sayfanın içeriğini yeniler, başlığını korur.</small></label>
  </div>

  <div class="choice-list"><label><input type="checkbox" name="confluenceEnabled" [(ngModel)]="enabled"><span><strong>Entegrasyonu aç</strong><small>Sprint detayından ve Backlog sayfasından wikiye gönderimi etkinleştirir.</small></span></label></div>

  <div class="page-actions">
   <button class="btn primary" [disabled]="busy" (click)="save()">Kaydet</button>
   <button class="btn" [disabled]="busy" (click)="test()">Bağlantıyı dene</button>
   @if(status?.patConfigured){<button class="btn" [disabled]="busy" (click)="setForget(true)">Tokenı sil</button>}
  </div>

  @if(message){<p class="inline-success" role="status">{{ message }}</p>}
  @if(error){<p class="notice warn" role="alert">{{ error }}</p>}
  @if(testResult){<p class="data-note">Bağlanan kullanıcı: <strong>{{ testResult.user }}</strong>@if(testResult.space){ · Alan: <strong>{{ testResult.space }}</strong>}@if(testResult.spaceReachable===false){ · {{ testResult.spaceError }}}</p>}

  @if(confirmForget){<div class="modal-layer"><div class="modal"><header><h2>Confluence tokenı silinsin mi?</h2><p>Token silinince sprint planları ve Backlog wikiye gönderilemez.</p></header>
   <footer><button type="button" class="btn" (click)="setForget(false)">Vazgeç</button><button type="button" class="btn danger" [disabled]="busy" (click)="forget()">Tokenı sil</button></footer></div></div>}
 </section>`,
})
export class ConfluenceSettingsComponent implements OnInit,OnDestroy {
 private api=inject(ApiService);private cdr=inject(ChangeDetectorRef);private destroyed=false;private version=0;
 status:ConfluenceStatus|null=null;
 baseUrl='';spaceKey='';parentPageId='';backlogPageId='';enabled=false;pat='';
 busy=false;error='';message='';confirmForget=false;testResult:ConfluenceTestResult|null=null;

 async ngOnInit(){await this.load();}
 ngOnDestroy(){this.destroyed=true;this.pat='';}
 private refresh(){if(!this.destroyed)this.cdr.detectChanges();}
 private apply(s:ConfluenceStatus){this.status=s;this.baseUrl=s.baseUrl;this.spaceKey=s.spaceKey;this.parentPageId=s.parentPageId;this.backlogPageId=s.backlogPageId||'';this.enabled=s.enabled;this.version=s.version;}

 async load(){if(this.busy)return;try{this.apply(await this.api.get<ConfluenceStatus>('/admin/confluence'));}catch{this.error='Confluence ayarları alınamadı.';}finally{this.refresh();}}

 async save(){
  const data={baseUrl:this.baseUrl,spaceKey:this.spaceKey,parentPageId:this.parentPageId,backlogPageId:this.backlogPageId,enabled:this.enabled,version:this.version,pat:this.pat};
  this.pat='';
  await this.run(()=>this.api.put<ConfluenceStatus>('/admin/confluence',data),'Confluence ayarları kaydedildi.');
 }

 async test(){
  if(this.busy)return;
  this.busy=true;this.error='';this.message='';this.testResult=null;this.refresh();
  try{
   const result=await this.api.post<ConfluenceTestResult>('/admin/confluence/test',{});
   this.testResult=result;
   this.message=result.spaceReachable===false?'Confluence bağlantısı kuruldu ama alan açılamadı.':'Confluence bağlantısı doğrulandı.';
  }catch(e){this.error=String(e);}
  finally{this.busy=false;this.refresh();}
 }

 setForget(value:boolean){this.confirmForget=value;this.refresh();}
 async forget(){await this.run(()=>this.api.delete<ConfluenceStatus>('/admin/confluence/credentials'),'Confluence tokenı silindi.');this.confirmForget=false;this.testResult=null;this.refresh();}

 private async run(fn:()=>Promise<ConfluenceStatus>,message:string){
  if(this.busy)return;
  this.busy=true;this.error='';this.message='';this.refresh();
  try{this.apply(await fn());this.message=message;}
  catch(e){this.error=String(e);}
  finally{this.busy=false;this.refresh();}
 }
}
