import { Component,ChangeDetectorRef,inject,OnInit,OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService,ProductSettings,formatDate } from '../api.service';
import { DirtyStateService,DirtyTracker } from '../shared/dirty-state';

@Component({selector:'app-work-settings',standalone:true,imports:[FormsModule],template:`
<section class="card card-pad work-settings"><span class="eyebrow">EKİP VE ÇALIŞMA DÜZENİ</span><h2>Çalışma varsayılanları</h2>
<p class="data-note">Ekip adı tüm uygulamada güncellenir. Çalışma düzeni seçilen tarihten itibaren günlük/aylık kapasitede ve bundan sonra oluşturulan sprintlerde kullanılır. Yeni sprint başlangıç tarihine uygun düzeni alır; mevcut sprintler, görev eforları ve 2026 dahil takvim kayıtları değişmez.</p>
@if(loaded){<form (ngSubmit)="save()" class="form-grid">
<div class="form-grid two"><label class="field">Ekip adı<input name="teamName" [(ngModel)]="name" maxlength="100" required></label><label class="field">Günlük çalışma saati<input name="workHours" type="number" min="1" max="24" step="0.5" [(ngModel)]="hours" required><small>1 çalışma günü için saat; BAU günlerinin efor dönüşümünde de kullanılır.</small></label></div>
<fieldset><legend>Çalışma günleri</legend><div class="week-options">@for(d of week;track d.value){<label><input type="checkbox" [name]="'weekday'+d.value" [ngModel]="days.includes(d.value)" (ngModelChange)="toggle(d.value,$event)">{{d.label}}</label>}</div></fieldset>
<label class="field">Geçerlilik başlangıcı<input name="workFrom" type="date" [(ngModel)]="from" [min]="today" required><small>Geçmiş tarih seçilemez. Aynı başlangıç tarihini kaydetmek o günün düzenini günceller; mevcut sprintleri değiştirmez.</small></label>
<div class="page-actions"><button class="btn primary" [disabled]="saving||!days.length" type="submit">{{saving?'Kaydediliyor…':'Çalışma düzenini kaydet'}}</button><button class="btn" type="button" [disabled]="saving" (click)="reset()">Vazgeç</button>@if(dirty()){<span class="dirty-hint" role="status">Kaydedilmemiş değişiklik var</span>}</div></form>
<p class="data-note">Başlangıç varsayılanı: Pazartesi–Cuma, 8 saat/gün. Resmî ve kişiye özel çalışılmayan günler ayrıca takvimden düşülür. Yarım gün tatilleri tam gün sayma tercihiniz korunur.</p>
@if(history.length){<div class="list">@for(p of history;track p.effectiveFrom){<div class="list-row"><span><strong>{{formatDate(p.effectiveFrom)}} itibarıyla</strong><small>{{dayNames(p.workingDays)}} · {{p.hoursPerDay}} saat/gün</small></span><span class="status">{{p.effectiveFrom>today?'Planlandı':'Kaydedildi'}}</span>@if(p.effectiveFrom>=today){<button class="btn small" type="button" (click)="editPolicy(p)">Düzenle</button>}</div>}</div>}
} @else {<p>Çalışma ayarları yükleniyor…</p>}
@if(message){<p class="inline-success" role="status">{{message}}</p>}@if(error){<p class="notice warn" role="alert">{{error}}</p>}
</section>`,styles:[`.work-settings{margin:18px 0}.week-options{display:flex;flex-wrap:wrap;gap:12px}.week-options label{display:flex;align-items:center;gap:7px}.week-options input{width:18px;height:18px}fieldset{border:1px solid #dce6f2;border-radius:10px;padding:16px;min-width:0}legend{font-size:12px;font-weight:700}small{overflow-wrap:anywhere}`]})
export class WorkSettingsComponent implements OnInit,OnDestroy{
 private dirtyState=inject(DirtyStateService);private tracker=new DirtyTracker();
 /** Only the fields the user can edit count towards the warning. */
 private formValue(){return {name:this.name,hours:this.hours,days:[...this.days].sort(),from:this.from};}
 dirty(){return this.tracker.isDirty(this.formValue());}
 ngOnDestroy(){this.dirtyState.release(this);}
 private api=inject(ApiService);private cdr=inject(ChangeDetectorRef);loaded=false;saving=false;error='';message='';name='';hours=8;days=[1,2,3,4,5];from='';today='';formatDate=formatDate;
 history:NonNullable<ProductSettings['workSchedules']>=[];private saved:ProductSettings|null=null;
 week=[{value:1,label:'Pazartesi'},{value:2,label:'Salı'},{value:3,label:'Çarşamba'},{value:4,label:'Perşembe'},{value:5,label:'Cuma'},{value:6,label:'Cumartesi'},{value:7,label:'Pazar'}];
 async ngOnInit(){this.dirtyState.register(this,{label:'Çalışma düzeni',isDirty:()=>this.dirty()});await this.load();}
 async load(){try{this.accept(await this.api.get<ProductSettings>('/settings'));this.error='';}catch(e){this.error=String(e);}finally{this.cdr.detectChanges();}}
 private accept(s:ProductSettings){this.saved=s;this.today=s.today||'';this.history=s.workSchedules||[];this.loaded=true;this.reset();}
 reset(){if(!this.saved)return;this.name=this.saved.teamName||'VibeCraft Team';this.hours=this.saved.hoursPerDay;this.days=[...(this.saved.workingDays||[1,2,3,4,5])];this.from=this.today;this.message='';this.error='';this.tracker.reset(this.formValue());this.cdr.detectChanges();}
 editPolicy(p:{effectiveFrom:string;hoursPerDay:number;workingDays:number[]}){this.from=p.effectiveFrom;this.hours=p.hoursPerDay;this.days=[...p.workingDays];this.message='';this.error='';this.cdr.detectChanges();}
 toggle(day:number,checked:boolean){this.days=checked?[...this.days,day].sort():this.days.filter(d=>d!==day);}
 dayNames(days:number[]){return this.week.filter(d=>days.includes(d.value)).map(d=>d.label).join(', ');}
 async save(){if(this.saving)return;this.saving=true;this.tracker.saving(true);this.error='';this.message='';try{const date=this.from;const s=await this.api.put<ProductSettings>('/settings/work-schedule',{teamName:this.name,hoursPerDay:this.hours,workingDays:this.days,effectiveFrom:date});this.accept(s);this.message='Kaydedildi. '+formatDate(date)+' itibarıyla uygulanır; mevcut sprintler korunmuştur.';}catch(e){this.error=String(e);}finally{this.saving=false;this.tracker.saving(false);this.cdr.detectChanges();}}
}
