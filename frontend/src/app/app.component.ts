import { ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit, inject, effect } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { AuthComponent } from './auth.component';
import { PasswordChangeComponent } from './password-change.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, AuthComponent, PasswordChangeComponent],
  template: `
    @if (!auth.loaded()) {
      <div class="loading auth-loading">SprintBoard açılıyor…</div>
    } @else if (auth.connectionError()) {
      <div class="auth-page"><div class="card empty"><strong>Bağlantı kurulamadı</strong>{{ auth.connectionError() }}<br><button class="btn" (click)="auth.refresh()">Tekrar dene</button></div></div>
    } @else if (!auth.state()?.authenticated) {
      <app-auth></app-auth>
    } @else {
    <button class="skip-link" type="button" [attr.inert]="narrow && menuOpen ? '' : null" (click)="focusMain()">Ana içeriğe geç</button>
    <div class="app-shell" [class.viewer-mode]="!auth.isAdmin()">
      <aside class="sidebar" id="primary-navigation" aria-label="Ana gezinme" [class.open]="menuOpen" [attr.inert]="narrow && !menuOpen ? '' : null" [attr.role]="narrow && menuOpen ? 'dialog' : null" [attr.aria-modal]="narrow && menuOpen ? 'true' : null">
        <button class="nav-close btn small" type="button" (click)="closeMenu()" aria-label="Menüyü kapat">Kapat ×</button>
        <a class="brand" routerLink="/overview" aria-label="SprintBoard genel bakışına dön" title="Genel bakışa dön" (click)="closeMenu(true)"><span class="brand-mark">S</span><span><strong>SprintBoard</strong><small>SPRINT YÖNETİMİ</small></span></a>
        <nav>
          @for (group of navGroups; track group.title) {
            <div class="nav-group"><div class="nav-caption">{{ group.title }}</div>
              @for (item of group.items; track item.path) {
                @if (item.path !== '/settings' || auth.isAdmin()) {
                <a class="nav-link" [routerLink]="item.path" routerLinkActive="active" ariaCurrentWhenActive="page" [routerLinkActiveOptions]="{exact: item.path === '/overview'}" (click)="closeMenu(true)">
                  <span class="nav-icon" aria-hidden="true">{{ item.icon }}</span><span>{{ item.label }}</span>
                </a>
                }
              }
            </div>
          }
        </nav>
      </aside>
      <button type="button" class="sidebar-backdrop" aria-label="Menüyü kapat" tabindex="-1" [class.visible]="menuOpen" (click)="closeMenu()"></button>
      <div class="page-shell" [attr.inert]="narrow && menuOpen ? '' : null">
        <header class="topbar">
          <button type="button" class="mobile-menu icon-button" aria-label="Menüyü aç" aria-controls="primary-navigation" [attr.aria-expanded]="menuOpen" (click)="openMenu()">☰</button>
          <div class="topbar-title"><span [title]="api.teamName()" style="display:block;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ api.teamName() }}</span><strong>{{ currentTitle }}</strong></div>
          <span class="topbar-spacer"></span><div class="session-identity"><strong>{{ auth.state()?.username }}</strong><small>{{ auth.isAdmin() ? 'Yönetici' : auth.state()?.memberId ? 'Takım üyesi' : 'Salt okunur kullanıcı' }}</small></div><app-password-change></app-password-change>
          <form action="/logout" method="post"><input type="hidden" name="_csrf" [value]="auth.csrfToken()"><button class="btn small" type="submit">Çıkış</button></form>
        </header>
        <main id="main-content" class="main-content" tabindex="-1"><router-outlet></router-outlet></main>
      </div>
    </div>
    }
  `,
})
export class AppComponent implements OnInit, OnDestroy {
  api=inject(ApiService);
  constructor(){effect(()=>{if(this.auth.state()?.authenticated)void this.api.get('/settings').catch(()=>{});else this.api.teamName.set('SprintBoard');});}
  private router = inject(Router);
  auth = inject(AuthService);
  private cdr=inject(ChangeDetectorRef);
  private breakpoint=window.matchMedia('(max-width:800px)');
  narrow=this.breakpoint.matches;
  private resize=()=>{this.narrow=this.breakpoint.matches;if(!this.narrow)this.closeMenu();this.cdr.markForCheck();};
  ngOnInit(): void { this.breakpoint.addEventListener('change',this.resize);void this.auth.refresh(); }
  ngOnDestroy(){this.breakpoint.removeEventListener('change',this.resize);if(this.menuOpen)document.body.style.overflow=this.previousOverflow;}
  get initials(): string { return (this.auth.state()?.username || 'U').slice(0, 2).toUpperCase(); }
  menuOpen = false;
  private previousOverflow='';
  openMenu(){if(!this.narrow)return;this.previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';this.menuOpen=true;this.cdr.detectChanges();document.querySelector<HTMLElement>('.nav-close')?.focus();}
  closeMenu(navigating=false){if(!this.menuOpen)return;this.menuOpen=false;document.body.style.overflow=this.previousOverflow;this.cdr.detectChanges();queueMicrotask(()=>{(navigating?document.getElementById('main-content'):document.querySelector<HTMLElement>('.mobile-menu'))?.focus({preventScroll:true});});}
  @HostListener('document:keydown',['$event']) menuKey(event:KeyboardEvent){
    if(!this.narrow||!this.menuOpen)return;
    if(event.key==='Escape'){event.preventDefault();this.closeMenu();}
    if(event.key==='Tab'){
      const controls=Array.from(document.querySelectorAll<HTMLElement>('#primary-navigation button,#primary-navigation a[href]')).filter(e=>e.getClientRects().length>0);
      const first=controls[0],last=controls.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
  }
  focusMain(): void { document.getElementById('main-content')?.focus(); }
  navGroups = [
    { title: 'ÜRÜN', items: [
      { path: '/overview', label: 'Genel bakış', icon: '⌂' }, { path: '/roadmap', label: 'Roadmap', icon: '◇' },
      { path: '/backlog', label: 'Backlog', icon: '≡' }, { path: '/sprints', label: 'Sprintler', icon: '▣' },
    ] },
    { title: 'EKİP OPERASYONU', items: [
      { path: '/team', label: 'Takım', icon: '●' }, { path: '/leaves', label: 'İzinler', icon: '◷' },
      { path: '/overtime', label: 'Fazla mesai', icon: '◴' },
    ] },
    { title: 'İÇGÖRÜLER', items: [{ path: '/reports', label: 'Raporlar', icon: '↗' }] },
    { title: 'YÖNETİM', items: [{ path: '/settings', label: 'Ayarlar', icon: '⚙' }] },
  ];
  get currentTitle(): string {
    const segment = this.router.url.split('?')[0].split('/')[1] || 'overview';
    return this.navGroups.flatMap(group => group.items).find(item => item.path === `/${segment}`)?.label || 'Genel bakış';
  }
}
