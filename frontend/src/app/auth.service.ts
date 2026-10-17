import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface AuthState {
  authenticated: boolean;
  setupRequired: boolean;
  username: string | null;
  role: 'ADMIN' | 'USER' | null;
  memberId?: string;
  memberName?: string;
  csrfToken: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  passwordChanged = signal(false);
  private http = inject(HttpClient);
  readonly state = signal<AuthState | null>(null);
  readonly loaded = signal(false);
  readonly connectionError = signal('');

  async refresh(): Promise<void> {
    try {
      this.state.set(await firstValueFrom(this.http.get<AuthState>('/api/auth/session')));
      this.connectionError.set('');
    } catch {
      this.connectionError.set('SprintBoard servisine bağlanılamadı. Sayfayı yenileyin.');
    } finally { this.loaded.set(true); }
  }

  async setupAdmin(username: string, password: string): Promise<void> {
    const csrf = this.state()?.csrfToken;
    if (!csrf) throw new Error('Güvenlik oturumu hazır değil. Sayfayı yenileyin.');
    await firstValueFrom(this.http.post('/api/auth/setup', { username, password }, { headers: { 'X-CSRF-TOKEN': csrf } }));
    await this.refresh();
  }

  isAdmin(): boolean { return this.state()?.role === 'ADMIN'; }
  canWork(task: {assignments:{memberId:string}[]}): boolean {return this.isAdmin() || !!this.state()?.memberId && task.assignments.some(a=>a.memberId===this.state()?.memberId);}
  csrfToken(): string { return this.state()?.csrfToken || ''; }
}
