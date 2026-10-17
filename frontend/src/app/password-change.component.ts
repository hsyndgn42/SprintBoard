import { ChangeDetectorRef, Component, ElementRef, OnDestroy, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

@Component({selector:'app-password-change',standalone:true,imports:[FormsModule],template:`
<button type="button" class="avatar account-trigger" aria-label="Şifremi değiştir" title="Şifremi değiştir" (click)="open()">{{ initials }}</button>
<dialog #dialog class="password-dialog" aria-labelledby="password-title" aria-describedby="password-help" (cancel)="cancel($event)" (close)="clear()">
  <form (ngSubmit)="save()">
    <header><span class="eyebrow">HESABIM</span><h2 id="password-title">Şifremi değiştir</h2><p>{{ auth.state()?.username }}</p></header>
    <div class="password-body">
      <p id="password-help">Mevcut şifrenizi doğrulayın. Kaydedince bu cihaz dahil tüm oturumlarınız kapanır; yeni şifrenizle tekrar giriş yaparsınız.</p>
      <label class="field">Mevcut şifre<input name="currentPassword" type="password" autocomplete="current-password" [(ngModel)]="current" required maxlength="72" [disabled]="busy"></label>
      <label class="field">Yeni şifre<input name="newPassword" type="password" autocomplete="new-password" [(ngModel)]="password" required minlength="12" maxlength="72" [disabled]="busy"><small>En az 12 karakter, UTF-8 olarak en fazla 72 bayt. Mevcut şifreden farklı olmalı.</small></label>
      <label class="field">Yeni şifre tekrar<input name="confirmPassword" type="password" autocomplete="new-password" [(ngModel)]="confirmation" required maxlength="72" [disabled]="busy"></label>
      @if(error){<p class="notice warn" role="alert">{{ error }}</p>}
    </div>
    <footer><button type="button" class="btn" [disabled]="busy" (click)="close()">Vazgeç</button><button type="submit" class="btn primary" [disabled]="busy">{{ busy ? 'Kaydediliyor…' : 'Şifreyi değiştir' }}</button></footer>
  </form>
</dialog>`,styles:[`
:host{display:flex;flex:none}.account-trigger{cursor:pointer;border:1px solid #cbdcff;font:inherit;font-weight:750}.account-trigger:hover{background:#dceaff}.account-trigger:focus-visible{outline:3px solid #1766cb;outline-offset:3px}
.password-dialog{padding:0;border:1px solid #d6e1ef;border-radius:14px;width:min(500px,calc(100vw - 24px));max-height:calc(100dvh - 24px);color:#173250;box-shadow:0 24px 70px #162d4c38}.password-dialog::backdrop{background:#10243b80}.password-dialog[open]{display:flex}.password-dialog form{display:flex;flex-direction:column;width:100%;min-height:0;max-height:calc(100dvh - 26px)}header{padding:20px 24px;border-bottom:1px solid #e5ebf5;flex:none}h2{font-size:20px;margin:6px 0}header p{margin:6px 0 0;overflow-wrap:anywhere}.password-body{padding:12px 24px 24px;overflow-y:auto;min-height:0}.password-body>p{font-size:13px;line-height:1.6}.field{margin-top:18px}.field small{font-size:11px;line-height:1.6}footer{display:flex;justify-content:flex-end;gap:10px;padding:16px 24px;border-top:1px solid #e5ebf5;flex:none}@media(max-width:620px){header,.password-body{padding-left:18px;padding-right:18px}footer{padding:14px}}
`]})
export class PasswordChangeComponent implements OnDestroy {
  auth=inject(AuthService);private api=inject(ApiService);private cdr=inject(ChangeDetectorRef);
  @ViewChild('dialog') dialog!:ElementRef<HTMLDialogElement>;
  current='';password='';confirmation='';error='';busy=false;
  get initials(){return (this.auth.state()?.username||'U').slice(0,2).toUpperCase();}
  open(){this.clear();this.error='';this.cdr.detectChanges();this.dialog.nativeElement.showModal();}
  close(){if(this.busy)return;this.dialog.nativeElement.close();this.clear();}
  cancel(event:Event){event.preventDefault();this.close();}
  clear(){this.current='';this.password='';this.confirmation='';}
  ngOnDestroy(){this.clear();}
  async save(){
    if(this.busy)return;this.error='';
    if(this.password!==this.confirmation){this.error='Yeni şifreler eşleşmiyor.';return;}
    if(this.password.length<12||new TextEncoder().encode(this.password).length>72){this.error='Yeni şifre en az 12 karakter, UTF-8 olarak en fazla 72 bayt olmalı.';return;}
    if(this.current===this.password){this.error='Yeni şifre mevcut şifreden farklı olmalı.';return;}
    this.busy=true;
    try{
      await this.api.post('/auth/password',{currentPassword:this.current,password:this.password,confirmation:this.confirmation});
      this.clear();this.dialog.nativeElement.close();
      this.auth.passwordChanged.set(true);
      await this.auth.refresh();
    }catch(e){this.error=e instanceof Error ? e.message : 'Şifre değiştirilemedi. Yeniden deneyin.';this.clear();}
    finally{
      this.busy=false;this.cdr.markForCheck();
      if(this.dialog.nativeElement.open){
        this.cdr.detectChanges();
        // NgModel re-enables its control in a microtask after change detection.
        queueMicrotask(()=>{
          if(this.dialog.nativeElement.open)
            this.dialog.nativeElement.querySelector<HTMLInputElement>('[name=currentPassword]')?.focus();
        });
      }
    }
  }
}
