import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [FormsModule],
  template: `
    <main class="auth-page">
      <div class="auth-brand"><span class="brand-mark">S</span><span><strong>SprintBoard</strong><small>SPRINT YÖNETİMİ</small></span></div>
      <section class="auth-card">
        @if (auth.state()?.setupRequired) {
          <span class="eyebrow">İLK KURULUM</span><h1>Yönetici hesabını oluştur</h1>
          <p>Bu bilgisayardaki ilk erişim için kendi yönetici bilgilerini belirle. Şifre yalnız yerel veritabanında güvenli özet olarak saklanır.</p>
          <form class="form-grid" (ngSubmit)="setup()">
            <label class="field">Kullanıcı adı<input name="username" autocomplete="username" [(ngModel)]="username" required minlength="3" maxlength="80" pattern="[A-Za-z0-9._-]+"></label>
            <label class="field">Şifre<input name="password" type="password" autocomplete="new-password" [(ngModel)]="password" required minlength="12" maxlength="72"><small>En az 12 karakter, UTF-8 olarak en fazla 72 bayt.</small></label>
            <label class="field">Şifreyi doğrula<input name="confirm" type="password" autocomplete="new-password" [(ngModel)]="confirm" required></label>
            <button class="btn primary auth-submit" type="submit" [disabled]="busy">Yönetici hesabını oluştur</button>
          </form>
        } @else {
          <span class="eyebrow">GÜVENLİ GİRİŞ</span><h1>SprintBoard’a giriş yap</h1>
          @if (auth.passwordChanged()) { <p class="notice" role="status">Şifreniz değiştirildi. Tüm oturumlarınız kapatıldı; yeni şifrenizle giriş yapın.</p> }
          <p>Sprintleri, ekibi ve raporları görüntülemek için hesabınla oturum aç.</p>
          <form class="form-grid" action="/login" method="post" ngNoForm>
            <input type="hidden" name="_csrf" [value]="auth.csrfToken()">
            <label class="field">Kullanıcı adı<input name="username" autocomplete="username" required autofocus></label>
            <label class="field">Şifre<input name="password" type="password" autocomplete="current-password" required></label>
            <button class="btn primary auth-submit" type="submit">Giriş yap</button>
          </form>
          @if (loginFailed) { <p class="auth-error" role="alert">Kullanıcı adı veya şifre hatalı.</p> }
        }
        @if (error) { <p class="auth-error" role="alert">{{ error }}</p> }
      </section>
      <p class="auth-footer">Yerel kurulum · Veriler bu bilgisayarda saklanır</p>
    </main>
  `,
})
export class AuthComponent {
  auth = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);
  username = '';
  password = '';
  confirm = '';
  busy = false;
  error = '';
  get loginFailed(): boolean { return window.location.hash.includes('error=1'); }
  async setup(): Promise<void> {
    this.error = '';
    if (this.password !== this.confirm) { this.error = 'Şifreler eşleşmiyor.'; return; }
    this.busy = true;
    try { await this.auth.setupAdmin(this.username, this.password); this.password = ''; this.confirm = ''; }
    catch (error) {
      const response = error as { error?: { error?: string } };
      this.error = response.error?.error || 'Hesap oluşturulamadı. Bilgileri kontrol edin.';
    } finally { this.busy = false; this.cdr.detectChanges(); }
  }
}
