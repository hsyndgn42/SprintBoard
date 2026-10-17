import { ListPagerComponent } from '../list-pager.component';
import { ChangeDetectorRef, Component, ElementRef, OnInit, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, TeamMember } from '../api.service';
import { LoginHistoryComponent } from './login-history.component';

interface Account { username: string; role: string; active: boolean; createdAt: string; memberId: string }
interface AccountEvent { id: number; username: string; actor: string; action: string; occurredAt: string }
type Action = 'create' | 'password' | 'disable' | 'enable' | 'member';

@Component({
  selector: 'app-accounts', standalone: true, imports: [ListPagerComponent, FormsModule, LoginHistoryComponent],
  templateUrl: './accounts.component.html', styleUrl: './accounts.component.css',
})
export class AccountsComponent implements OnInit {
  private api = inject(ApiService);
  private cdr = inject(ChangeDetectorRef);
  @ViewChild('accountDialog') dialog!: ElementRef<HTMLDialogElement>;
  members:TeamMember[]=[];memberId='';
  rows: Account[] = []; events: AccountEvent[] = [];
  query = ''; state = 'all'; loading = true; busy = false; loadFailed = false;
  error = ''; formError = ''; message = ''; action: Action = 'create';
  username = ''; password = ''; repeatPassword = ''; confirmed = false;
  get filtered() { return this.rows.filter(r => r.username.includes(this.query.trim().toLowerCase()) && (this.state === 'all' || r.active === (this.state === 'active'))); }
  get activeCount() { return this.rows.filter(r => r.active).length; }
  get title() { return ({ create: 'Kullanıcı ekle', member:'Takım üyesi bağlantısı', password: 'Kullanıcı şifresini yenile', disable: 'Kullanıcıyı pasifleştir', enable: 'Kullanıcıyı etkinleştir' })[this.action]; }
  get passwordAction() { return this.action === 'create' || this.action === 'password'; }
  get validPassword() { return this.password.length >= 12 && new TextEncoder().encode(this.password).length <= 72; }
  refresh() { this.cdr.markForCheck(); }
  ngOnInit() { void this.load(); }
  async load() {
    this.loading = true; this.error = ''; this.loadFailed = false;
    try { [this.rows, this.events,this.members] = await Promise.all([this.api.get<Account[]>('/admin/users'), this.api.get<AccountEvent[]>('/admin/account-events'),this.api.get<TeamMember[]>('/team')]); }
    catch (e) { this.error = String(e); this.loadFailed = true; }
    finally { this.loading = false; this.refresh(); }
  }
  open(action: Action, account?: Account) {
    this.action = action; this.username = account?.username || ''; this.password = ''; this.repeatPassword = '';
    this.memberId=account?.memberId||'';this.confirmed = false; this.formError = ''; this.message = '';
    this.cdr.detectChanges(); this.dialog.nativeElement.showModal();
  }
  close() {
    if (this.busy) return;
    this.dialog.nativeElement.close(); this.clearSecrets(); this.refresh();
  }
  clearSecrets() { this.password = ''; this.repeatPassword = ''; this.confirmed = false; }
  onCancel(event: Event) { event.preventDefault(); this.close(); }
  async save() {
    if (this.busy) return;
    this.formError = '';
    if (this.passwordAction && (!this.validPassword || this.password !== this.repeatPassword)) {
      this.formError = 'Şifreler aynı olmalı; en az 12 karakter ve UTF-8 olarak en fazla 72 bayt kullanın.'; this.refresh(); return;
    }
    if (this.action !== 'create' && !this.confirmed) { this.formError = 'İşlemi onaylayın.'; this.refresh(); return; }
    this.busy = true;
    try {
      const target = '/admin/users/' + encodeURIComponent(this.username);
      if (this.action === 'create') await this.api.post('/admin/users', { username: this.username, password: this.password });
      else if(this.action==='member')await this.api.put(target+'/member',{memberId:this.memberId});
      else if (this.action === 'password') await this.api.post(target + '/password', { password: this.password });
      else await this.api.put(target + '/status', { active: this.action === 'enable' });
      this.dialog.nativeElement.close(); this.clearSecrets();
      this.message = ({create:'Hesap oluşturuldu. Takım üyesine bağlayabilirsiniz.',member:'Takım bağlantısı güncellendi. Kullanıcı yeniden giriş yapmalı.', password:'Şifre yenilendi. Eski oturumlar geçersizleşti.', disable:'Hesap pasifleştirildi. Eski oturumlar geçersizleşti.', enable:'Hesap etkinleştirildi. Kullanıcı yeniden giriş yapabilir.'})[this.action];
      await this.load();
    } catch (e) { this.formError = String(e); }
    finally { this.busy = false; this.refresh(); }
  }
  actionLabel(action: string) { return ({MEMBER_LINKED:'Takım bağlantısı değişti',ADMIN_CREATED:'İlk yönetici oluşturuldu', USER_CREATED:'Kullanıcı oluşturuldu', USER_DISABLED:'Pasifleştirildi', USER_ENABLED:'Etkinleştirildi', PASSWORD_RESET:'Şifre yenilendi', PASSWORD_CHANGED:'Kendi şifresini değiştirdi', ADMIN_RECOVERED:'Yerel yönetici kurtarma'} as Record<string,string>)[action] || action; }
  date(value: string) { return new Intl.DateTimeFormat('tr-TR', {dateStyle:'short',timeStyle:'short'}).format(new Date(value)); }
}
