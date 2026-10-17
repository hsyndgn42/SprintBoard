import { ModalAccessibilityDirective } from '../modal-accessibility.directive';
import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, CapacityRow, ProductSettings, statusText } from '../api.service';

interface ClosureTask { id:string; name:string; status:string; outcome:string; automaticBau:boolean; bau:boolean; defaultCarry:boolean; estimatedHours:number; note:string;blocked?:boolean;blockReason?:string }
interface ClosurePreview { sprintId:string; name:string; fingerprint:string; tasks:ClosureTask[]; done:number; undone:number; deliveryCount:number; deliveryDone:number; capacity:CapacityRow[]; settings:ProductSettings }

@Component({selector:'app-sprint-close-dialog',standalone:true,imports: [ModalAccessibilityDirective, FormsModule],template:`
  <div class="modal-layer"><section class="modal closure-modal" role="dialog" aria-modal="true" aria-labelledby="closure-title">
    <header><span class="eyebrow">SPRİNT KAPANIŞI</span><h2 id="closure-title">Kapanış önizlemesi</h2><p>{{ preview?.name }} · Sonuçları kontrol et, sonraki sprintin iş havuzunu hazırla.</p></header>
    <div class="modal-body">
      @if(loading){<p role="status">Güncel sprint bilgileri kontrol ediliyor…</p>}
      @if(preview;as p){
        <div class="closure-metrics"><div><small>Done</small><strong>{{ p.done }}</strong></div><div><small>Undone kapanacak</small><strong>{{ p.undone }}</strong></div><div><small>Teslimat · BAU hariç</small><strong>{{ p.deliveryDone }}/{{ p.deliveryCount }}</strong></div><div><small>Yeni backlog kaydı</small><strong>{{ selected.length }}</strong></div></div>
        <section class="closure-capacity"><strong>{{ available }} sa kapasite · {{ planned }} sa atama</strong><p>{{ leave }} gün izin kapasiteden düşülmüş. {{ p.settings.estimationMode === 'SIZE_AND_HOURS' ? 'Size + efor' : 'Story Point + efor' }} kullanılıyor.</p>@if(planned>available){<p class="notice warn">Atanan efor kapasiteyi {{ planned-available }} saat aşıyor.</p>}<p class="data-note">Bu kapanışın kapasitesi, kişi atamaları, görev tahminleri ve tahmin yöntemi saklanır. Sonraki takım/ayar/izin değişiklikleri kapanış görünümünü değiştirmez.</p></section>
        @if(bauTasks.length){<h3>BAU · otomatik Done</h3><p class="data-note">BAU işleri manuel durum veya taşıma seçimi olmadan Done kapanır. Efor ve izin kayıtları korunur.</p>@for(task of bauTasks;track task.id){<div class="closure-row" [attr.data-task-id]="task.id"><div><strong>{{task.name}}</strong><small>Done · otomatik</small></div></div>}}
        <h3>Tamamlanmayan işler</h3><p class="data-note">Todo ve devam eden işler Undone kapanır. İşaretli işler yeni backlog kaydı olur; işaretlenmeyenler yalnız bu sprintin geçmişinde kalır.</p>
        @for(task of unfinished;track task.id){<div class="closure-row" [attr.data-task-id]="task.id"><div><strong>{{ task.name }}</strong><small>{{ statusText(task.status) }} → Undone · {{ task.estimatedHours }} sa</small><p>{{ task.note }}</p>@if(task.blocked){<p class="notice warn">Engelli kapanacak · {{ task.blockReason }}</p>}</div>@if(task.automaticBau){<span class="status">Yeni sprintte otomatik</span>}@else{<label><input type="checkbox" [checked]="selected.includes(task.id)" (change)="toggle(task.id)" [disabled]="saving">Backlog’a taşı</label>}</div>}
        @empty{<p class="inline-success">Tamamlanmamış iş yok.</p>}
        <details><summary>Done işler · {{ finished.length }} — gerekirse yeni iş olarak tekrarla</summary><p class="data-note">Tekrarlamak Done sonucunu değiştirmez; sonraki sprint için ayrı, ilişkili kayıt açar.</p>@for(task of finished;track task.id){<div class="closure-row" [attr.data-task-id]="task.id"><div><strong>{{ task.name }}</strong><small>Done · {{ task.estimatedHours }} sa</small></div>@if(task.automaticBau){<span class="status">Yeni sprintte otomatik</span>}@else{<label><input type="checkbox" [checked]="selected.includes(task.id)" (change)="toggle(task.id)" [disabled]="saving">Yeniden al</label>}</div>}</details>
        <label class="closure-confirm"><input type="checkbox" [ngModel]="confirmed" (ngModelChange)="confirm($event)" [disabled]="saving"><span>Sonuçları ve taşıma seçimlerini kontrol ettim. Sprinti kapatıp kapanış kaydını sabitle.</span></label>
      }
      @if(error){<p class="notice warn" role="alert">{{ error }}</p>}
    </div><footer><button data-modal-dismiss class="btn" [disabled]="saving" (click)="cancel.emit()">Vazgeç</button><button class="btn" [disabled]="saving || loading" (click)="load()">Önizlemeyi yenile</button><button class="btn primary" [disabled]="saving || loading || !preview || !confirmed" (click)="submit()">{{ saving ? 'Kapatılıyor…' : 'Onayla ve kapat' }}</button></footer>
  </section></div>
`,styles:[`.closure-modal{width:min(920px,100%)}.closure-metrics{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #dce6f2;border-radius:12px;overflow:hidden}.closure-metrics>div{padding:16px;background:#f8fbff}.closure-metrics small,.closure-metrics strong{display:block}.closure-metrics strong{font-size:24px;color:#163d65}.closure-capacity{margin:20px 0;padding:16px;border:1px solid #e0e7f0;border-radius:10px}.closure-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 0;border-bottom:1px solid #e7edf5}.closure-row>div{min-width:0}.closure-row strong,.closure-row small{display:block;overflow-wrap:anywhere}.closure-row small,.closure-row p{color:#65758b;font-size:12px}.closure-row p{margin-bottom:0;white-space:pre-wrap;overflow-wrap:anywhere}.closure-row label{display:flex;align-items:center;gap:8px;flex:none;font-size:13px}.closure-confirm{display:flex;gap:10px;align-items:flex-start;margin:24px 0 0;padding:16px;background:#edf5ff;border-radius:10px}input[type=checkbox]{flex:none;width:17px;height:17px}details{margin-top:24px}summary{cursor:pointer;font-weight:700}h3{margin-bottom:4px}footer{flex-wrap:wrap}@media(max-width:600px){.closure-metrics{grid-template-columns:1fr 1fr}.closure-row{align-items:start;flex-direction:column;gap:8px}.closure-metrics>div{padding:12px}.closure-metrics small{font-size:11px}}`]})
export class SprintCloseDialogComponent implements OnChanges,OnDestroy {
  @Input({required:true}) sprintId!:string;
  @Output() cancel=new EventEmitter<void>();@Output() completed=new EventEmitter<void>();
  private api=inject(ApiService);private cdr=inject(ChangeDetectorRef);private revision=0;private destroyed=false;
  preview:ClosurePreview|null=null;selected:string[]=[];confirmed=false;loading=false;saving=false;error='';statusText=statusText;
  get unfinished(){return this.preview?.tasks.filter(t=>t.outcome==='undone')||[];}
  get bauTasks(){return this.preview?.tasks.filter(t=>t.bau)||[];}
  get finished(){return this.preview?.tasks.filter(t=>t.outcome==='done'&&!t.bau)||[];}
  get available(){return this.preview?.capacity.reduce((n,r)=>n+r.availableHours,0)||0;}
  get planned(){return this.preview?.capacity.reduce((n,r)=>n+r.plannedHours,0)||0;}
  get leave(){return this.preview?.capacity.reduce((n,r)=>n+r.leaveDays,0)||0;}
  ngOnChanges(){this.load();}ngOnDestroy(){this.destroyed=true;this.revision++;}
  confirm(value:boolean){this.confirmed=value;this.cdr.detectChanges();}
  toggle(id:string){this.selected=this.selected.includes(id)?this.selected.filter(v=>v!==id):[...this.selected,id];this.confirmed=false;this.cdr.detectChanges();}
  async load(){const revision=++this.revision;this.loading=true;this.preview=null;this.confirmed=false;this.error='';try{const p=await this.api.get<ClosurePreview>('/sprints/'+encodeURIComponent(this.sprintId)+'/closure-preview');if(revision!==this.revision)return;this.preview=p;this.selected=p.tasks.filter(t=>t.defaultCarry).map(t=>t.id);}catch(e){if(revision===this.revision)this.error=String(e);}finally{if(revision===this.revision){this.loading=false;this.cdr.detectChanges();}}}
  async submit(){if(!this.preview||!this.confirmed||this.saving)return;this.saving=true;this.error='';this.cdr.detectChanges();try{await this.api.post('/sprints/'+encodeURIComponent(this.sprintId)+'/complete',{confirmed:true,fingerprint:this.preview.fingerprint,carryTaskIds:this.selected});this.completed.emit();}catch(e){const message=String(e);await this.load();this.error=message;}finally{this.saving=false;if(!this.destroyed)this.cdr.detectChanges();}}
}
