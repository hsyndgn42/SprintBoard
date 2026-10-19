import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../api.service';
interface LoginEvent { id:number; occurredAt:string; username:string; action:string; sourceId:string }
@Component({selector:'app-login-history',standalone:true,imports:[FormsModule],template:`
<details class="login-history"><summary>Giriş işlem geçmişi</summary>
  <p class="data-note">Son 30 günün en yeni 100 kaydı gösterilir. Başarısız girişte yazılan ad, doğrulanmış bir kullanıcı kimliği değildir. Kaynak etiketi bağlantı adresinin özetidir; açık IP, şifre veya oturum anahtarı tutulmaz.</p>
  <div class="history-filters"><label class="field">Giriş sonucu<select [(ngModel)]="action"><option value="">Tüm sonuçlar</option><option value="LOGIN_SUCCESS">Başarılı</option><option value="LOGIN_FAILURE">Başarısız</option><option value="LOGIN_BLOCKED">Sınır nedeniyle engellendi</option><option value="PASSWORD_CHANGE_FAILURE">Şifre değişikliği reddedildi</option><option value="PASSWORD_CHANGE_BLOCKED">Şifre değiştirme sınırı</option></select></label><label class="field">Denenen kullanıcı adı<input [(ngModel)]="query" placeholder="Kayıtlarda ara"></label><button class="btn ui-refresh" [disabled]="loading" (click)="load()">Yenile</button></div>
  @if(loading){<p role="status">Giriş kayıtları yükleniyor…</p>} @else if(error){<p class="notice warn" role="alert">{{ error }}</p>} @else {
    <p class="data-note">{{ filtered.length }} / {{ rows.length }} kayıt. Filtreler yalnız yüklenen son 100 kayıt içinde uygulanır.</p>
    @for(row of filtered;track row.id){<article class="login-event"><div><span class="status" [class.done]="row.action==='LOGIN_SUCCESS'" [class.undone]="row.action==='LOGIN_FAILURE'">{{ label(row.action) }}</span><strong>{{ row.username }}</strong><small>Kaynak: {{ row.sourceId }}</small></div><time [attr.datetime]="row.occurredAt">{{ date(row.occurredAt) }}</time></article>} @empty {<p class="empty">Filtreye uygun giriş kaydı yok.</p>}
  }
  <p class="data-note">Süreli engel hesabı pasifleştirmez; süre dolunca yeniden giriş denenebilir. Engelli tekrarlar aynı pencere için tek olayda özetlenir. Kayıtlar sunucuda en fazla 30 gün / 2.000 olay tutulur; süresi geçenler sonraki giriş olayında temizlenir.</p>
</details>`,styles:[`:host{display:block}.login-history{border-top:1px solid #e5ebf5;margin-top:20px;padding-top:18px}.login-history summary{cursor:pointer;font-weight:750}.history-filters{display:flex;gap:12px;align-items:end;margin:18px 0;flex-wrap:wrap}.history-filters .field{flex:1;min-width:170px}.login-event{display:flex;justify-content:space-between;gap:12px;padding:14px 0;border-bottom:1px solid #e5ebf5}.login-event strong,.login-event small{display:block;overflow-wrap:anywhere}.login-event strong{margin-top:6px}.login-event small,.login-event time{font-size:11px;color:#687b94}.login-event time{white-space:nowrap}@media(max-width:620px){.history-filters{display:grid;grid-template-columns:1fr}.history-filters .field{min-width:0}.login-event{flex-direction:column}}`]})
export class LoginHistoryComponent implements OnInit {
  private api=inject(ApiService);private cdr=inject(ChangeDetectorRef);
  rows:LoginEvent[]=[];loading=false;error='';action='';query='';
  get filtered(){return this.rows.filter(r=>(!this.action||r.action===this.action)&&r.username.toLocaleLowerCase('tr-TR').includes(this.query.trim().toLocaleLowerCase('tr-TR')));}
  ngOnInit(){void this.load();}
  async load(){if(this.loading)return;this.loading=true;this.error='';try{this.rows=await this.api.get<LoginEvent[]>('/admin/login-events');}catch(e){this.error=String(e);}finally{this.loading=false;this.cdr.markForCheck();}}
  label(value:string){return ({LOGIN_SUCCESS:'Başarılı giriş',LOGIN_FAILURE:'Başarısız giriş',LOGIN_BLOCKED:'Süreli engel',PASSWORD_CHANGE_FAILURE:'Şifre değişikliği reddedildi',PASSWORD_CHANGE_BLOCKED:'Şifre değiştirme sınırı'} as Record<string,string>)[value]||value;}
  date(value:string){return new Intl.DateTimeFormat('tr-TR',{dateStyle:'short',timeStyle:'short'}).format(new Date(value));}
}
