import { ChangeDetectorRef, Component, EventEmitter, Output, OnInit, OnDestroy, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../api.service';
import { AuthService } from '../auth.service';

interface BackupPreview { counts: Record<string, { current: number; incoming: number }>; currentFingerprint: string; backupFingerprint: string; exportedAt: string }
@Component({
  selector: 'app-backup', standalone: true, imports: [FormsModule],
  template: `
    <section class="card card-pad"><span class="eyebrow">VERİ VE GÜVENLİK</span><h2>Yedekleme ve geri yükleme</h2>
      @if (auth.isAdmin()) {
        <div class="backup-health" aria-live="polite">
          <div><small>Son başarılı yedek</small><strong>{{ backupStatus?.lastSuccessAt ? backupTime(backupStatus.lastSuccessAt) : 'Henüz kayıt yok' }}</strong></div>
          <div><small>Son işlem</small><strong>{{ backupStatus ? resultLabel(backupStatus.result) : 'Yükleniyor…' }}</strong><small>{{ backupTime(backupStatus?.lastAttemptAt) }}</small></div>
          <div><small>Sonraki otomatik yedek</small><strong>{{ backupStatus?.enabled ? backupTime(backupStatus.nextScheduledAt) : 'Kapalı' }}</strong><small>Türkiye saati · 10 gün saklama</small></div>
        </div>
        @if(statusError){<p class="notice warn" role="alert">Yedek durumu okunamadı. <button class="btn small" (click)="loadBackupStatus()">Yenile</button></p>}
        @if(backupStatus?.result==='FAILED'){<p class="notice warn">Son yedekleme başarısız. Önceki başarılı yedekler korundu.{{backupStatus.retryPending?' Otomatik işlem 5 dakikada bir yeniden denenir.':' Şimdi yedek al ile yeniden deneyebilirsiniz.'}}</p>}
        @if(backupStatus?.cleanupWarning){<p class="notice warn">{{backupStatus.cleanupWarning}}</p>}
        <div class="restore-actions"><button type="button" class="btn primary" data-testid="full-backup" [disabled]="busy" (click)="createFullBackup()">{{ fullBackupBusy ? 'Yedek alınıyor…' : 'Şimdi yedek al' }}</button></div>
        <p class="data-note">Tam veritabanı yedeği sunucuda saklanır; hesaplar ve Slack bağlantısı dahildir. Otomatik: 00:00, 08:00, 16:00 (Türkiye). Saklama: 10 gün.</p>
      }
<details class="restore-section"><summary>JSON dışa aktarma ve geri yükleme</summary>
      <p class="muted">Sprint, backlog, roadmap, takım, izin, mesai, Review notları, retro, takvim, kapasite ve ürün ayarlarını birlikte saklayın. Görev günlüğü ve mesai talepleri yedeğe dahildir. Giriş hesapları/parolalar dışa aktarılmaz; geri yükleme güvenlik için hesap–üye bağlantılarını kaldırır ve bağlı kullanıcıları yeniden girişe yönlendirir. Admin hesapları korunur.</p>
      <a class="btn primary" href="/api/export" download="sprintboard-backup.json">JSON yedeği indir</a>
      <div class="restore-section"><h3>Yedekten geri yükle</h3><p class="data-note">Birleştirme yapılmaz: mevcut ürün verisi seçili yedekle değiştirilir. Önce dosya doğrulanır; uygulamadan önce mevcut verinin güvenlik kopyası sunucunun backups klasörüne yazılır.</p>
        <label class="field">JSON yedeği seç (en fazla 20 MB)<input type="file" accept=".json,application/json" [disabled]="busy" (change)="selectFile($event)" data-testid="backup-file"></label>
        @if (filename) { <p class="data-note">{{ filename }}</p> }
        <button class="btn" [disabled]="busy || !backup" (click)="validate()">{{ busy ? 'İşleniyor…' : 'Yedeği doğrula ve önizle' }}</button>
      </div>
      @if (preview; as result) { <section class="restore-preview" aria-label="Geri yükleme önizlemesi"><h3>Değişecek veriler</h3><p class="data-note">Yedek tarihi: {{ result.exportedAt || 'Belirtilmemiş' }}. İlişki ve alan kontrolleri geçti.</p>
        <div class="table-wrap"><table><thead><tr><th>Veri</th><th>Mevcut</th><th>Yedekte</th></tr></thead><tbody>@for (row of previewRows; track row.key) { <tr><td>{{ row.label }}</td><td>{{ row.current }}</td><td>{{ row.incoming }}</td></tr> }</tbody></table></div>
        <p class="notice warn">Bu işlem mevcut ürün verisini değiştirir. İndirdiğiniz yedeği ayrıca güvenli bir yerde tutun.</p>
        <label class="field">Onaylamak için GERİ YÜKLE yazın<input [ngModel]="confirmation" (ngModelChange)="setConfirmation($event)" autocomplete="off" data-testid="restore-confirmation"></label>
        <div class="restore-actions"><button class="btn" [disabled]="busy" (click)="cancel()">Vazgeç</button><button class="btn primary" [disabled]="busy || confirmation !== 'GERİ YÜKLE'" (click)="restore()">Yedeği uygula</button></div>
      </section> }
      </details>
      @if (error) { <p class="notice warn" role="alert">{{ error }}</p> }
      @if (message) { <p class="notice" role="status">{{ message }}</p> }
    </section>
  `,
  styles: [`:host{display:block;margin:18px 0}.backup-health{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:18px 0}.backup-health>div{padding:16px;border:1px solid #dce5f0;border-radius:10px;background:#f8faff}.backup-health small,.backup-health strong{display:block}.backup-health small{color:#64748b;margin-bottom:6px}.backup-health strong{overflow-wrap:anywhere}@media(max-width:700px){.backup-health{grid-template-columns:1fr}}.restore-section,.restore-preview{border-top:1px solid #e2e8f0;padding-top:20px;margin-top:22px}.restore-section .field{margin:18px 0}.restore-actions{display:flex;gap:12px;margin-top:18px}.restore-preview{max-width:850px}.restore-preview table{width:100%}.notice{overflow-wrap:anywhere}`],
})
export class BackupComponent implements OnInit, OnDestroy {
  backupStatus: any = null; statusError=false; private statusTimer?: ReturnType<typeof setInterval>;
  ngOnInit(){void this.loadBackupStatus();this.statusTimer=setInterval(()=>void this.loadBackupStatus(),30000);}
  ngOnDestroy(){if(this.statusTimer)clearInterval(this.statusTimer);}
  async loadBackupStatus(){if(!this.auth.isAdmin())return;try{this.backupStatus=await this.api.get('/admin/backups/status');this.statusError=false;}catch{this.statusError=true;}finally{this.cdr.markForCheck();}}
  backupTime(value?:string){return value?new Intl.DateTimeFormat('tr-TR',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Istanbul'}).format(new Date(value)):'—';}
  resultLabel(value:string){return ({SUCCESS:'Başarılı',FAILED:'Hata',RUNNING:'Yedekleniyor',INTERRUPTED:'Yarım kaldı',UNKNOWN:'Durum doğrulanamadı',NEVER:'Henüz yedek alınmadı',DISABLED:'Kapalı'} as Record<string,string>)[value]||value;}
  private api = inject(ApiService);
  auth = inject(AuthService);
  fullBackupBusy = false;
  async createFullBackup() {
    if (this.busy || !this.auth.isAdmin()) return;
    this.busy = true; this.fullBackupBusy = true; this.error = ''; this.message = ''; this.cdr.detectChanges();
    try { const result = await this.api.post<{filename:string}>('/admin/backups/full', {}); this.message = 'Tam yedek oluşturuldu: ' + result.filename; }
    catch { this.error = 'Yedek alınamadı. Mevcut yedekler korundu; sunucu kayıtlarını kontrol edin.'; }
    finally { this.busy = false; this.fullBackupBusy = false; await this.loadBackupStatus(); this.cdr.detectChanges(); }
  }
  private cdr = inject(ChangeDetectorRef);
  @Output() restored = new EventEmitter<void>();
  backup: object | null = null;
  preview: BackupPreview | null = null;
  filename = ''; confirmation = ''; error = ''; message = ''; busy = false;
private labels: Record<string,string> = { member_participation:'Katılım dönemleri',sprint_member_presence:'Sprint katılım günleri', member_capacity_policy:'Kişi kapasite ayarları',sprint_member_policy:'Sprint kişi çalışma düzenleri', sprint_review_note:'Review toplantı notları',retro_action:'Retro aksiyonları',task_subtype:'İş alt türleri',roadmap_item:'Roadmap hedefleri',member:'Takım üyeleri',sprint:'Sprintler',backlog_item:'Backlog işleri',sprint_task:'Sprint görevleri',assignment:'Kişi atamaları',leave_record:'İzinler',overtime_snapshot:'Tarihsel mesailer',sprint_retro:'Retrolar',non_working_day:'Çalışılmayan günler',overtime_entry:'Mesai kayıtları',product_setting:'Ürün ayarları',sprint_member_allocation:'Sprint kişi kapasiteleri',bau_template:'BAU şablonları',backlog_dependency:'Backlog bağımlılıkları',sprint_closure:'Sabit kapanış kayıtları',defect_detail:'Defect bilgileri' };
  get previewRows() { return Object.entries(this.preview?.counts || {}).map(([key,counts]) => ({ key,label:this.labels[key] || key,...counts })); }
  async selectFile(event: Event) {
    this.backup = null; this.preview = null; this.confirmation = ''; this.error = ''; this.message = '';
    const file = (event.target as HTMLInputElement).files?.[0]; this.filename = file?.name || '';
    if (!file) return;
    this.busy = true;
    try { if (file.size > 20_000_000) throw new Error('Dosya 20 MB sınırını aşıyor.'); this.backup = JSON.parse(await file.text()); }
    catch { this.error = 'Dosya okunamadı. Geçerli, en fazla 20 MB büyüklüğünde bir JSON yedeği seçin.'; }
    finally { this.busy = false; this.cdr.detectChanges(); }
  }
  setConfirmation(value: string) { this.confirmation = value; this.cdr.detectChanges(); }
  cancel() { this.preview = null; this.confirmation = ''; this.cdr.detectChanges(); }
  async validate() {
    if (!this.backup) return; this.busy = true; this.error = ''; this.preview = null; this.confirmation = ''; this.message = '';
    try { this.preview = await this.api.post<BackupPreview>('/admin/backups/preview',this.backup); }
    catch (error) { this.error = String(error); }
    finally { this.busy = false; this.cdr.detectChanges(); }
  }
  async restore() {
    if (!this.preview || !this.backup || this.confirmation !== 'GERİ YÜKLE' || this.busy) return;
    this.busy = true; this.error = '';
    try {
      const result = await this.api.post<{safetyBackup:string}>('/admin/backups/restore', { backup:this.backup,confirmation:this.confirmation,currentFingerprint:this.preview.currentFingerprint,backupFingerprint:this.preview.backupFingerprint });
      this.message = 'Geri yükleme tamamlandı. Önceki verinin güvenlik yedeği: backups/' + result.safetyBackup;
      this.preview = null; this.confirmation = ''; this.restored.emit();
    } catch (error) { this.error = String(error); this.preview = null; this.confirmation = ''; }
    finally { this.busy = false; this.cdr.detectChanges(); }
  }
}
