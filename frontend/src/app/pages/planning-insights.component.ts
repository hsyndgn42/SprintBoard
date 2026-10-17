import { Component,Input,OnChanges,Output,EventEmitter,ChangeDetectorRef,inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { CapacityRow,ProductSettings,Task } from '../api.service';
import { planningInsights,assignmentPreview } from '../planning-insights.model';
@Component({selector:'app-planning-insights',standalone:true,imports:[FormsModule],template:`
<section class="card card-pad insights" [class.draft]="!!taskId" aria-label="Planlama kontrolleri">
<div class="section-head"><div><span class="eyebrow">{{taskId?'KAYDETME ÖNCESİ':'PLANLAMA KONTROLÜ'}}</span><h2>{{taskId?'Bu atamanın kapasite etkisi':'Yük dengesi ve eksik bilgiler'}}</h2></div>@if(!taskId){<span class="status" [class.undone]="model.attention>0">{{model.attention}} kişi kontrol bekliyor</span>}</div>
@if(!loaded){<p role="status">Kapasite yükleniyor; henüz değerlendirme yapılmadı.</p>}
@else{
<p class="data-note">{{historical?'Tarihsel plan kontrolü; gerçekleşen çalışma veya performans ölçümü değildir.':'Bu bilgiler tavsiyedir; kaydetmeyi veya sprint başlatmayı engellemez.'}} BAU saatleri dahildir; izin ve X efora eklenmez. Bir kişinin boşluğu diğer kişinin aşımını kapatmaz.</p>
@if(!taskId){<div class="insight-metrics"><div><small>Aşım</small><strong>{{fmt(model.overHours)}} sa</strong><span>{{model.overloaded}} kişi</span></div><div><small>Planlanabilir boşluk</small><strong>{{fmt(model.freeHours)}} sa</strong><span>İzin/odak sonrası</span></div><div><small>Eksik bilgili iş</small><strong>{{model.checks.length}}</strong><span>Atama{{mode==='POINTS_AND_HOURS'?' / saat / SP':' / saat'}}</span></div><div><small>X destek</small><strong>{{model.xCount}}</strong><span>Saat tüketmeyen atama</span></div></div>
@if(model.unknownHours){<p class="notice warn">{{fmt(model.unknownHours)}} saat için sprint kapasite kaydı yok; aşım toplamına dahil edilmedi. Katılım günlerini ve sprint planını kontrol edin.</p>}
<details class="people-details"><summary>Kişi bazlı dağılımı gör · {{model.people.length}} kişi</summary><div class="people-body"><label class="filter"><input type="checkbox" [(ngModel)]="onlyAttention" (ngModelChange)="changed()"> Yalnız kontrol bekleyen kişiler</label>
@for(p of visiblePeople;track p.id){<div class="person" [class.attention]="p.attention"><div><strong>{{p.name}}</strong><small>{{p.status}}@if(p.x){ · {{p.x}} X}</small></div><div class="person-hours"><span>{{fmt(p.hours)}} / {{p.capacity===null?'—':fmt(p.capacity)}} sa</span><small>{{p.capacity===null?'Kapasite bilinmiyor':p.over>.01?fmt(p.over)+' sa aşım':fmt(p.free)+' sa boşluk'}}</small></div>@if(editable&&p.row){<button type="button" class="btn small" (click)="allocate.emit(p.row)">Gün düzenle</button>}</div>}@empty{<p class="data-note">Bu filtrede kişi yok.</p>}
</div></details>
@if(mode==='POINTS_AND_HOURS'){<p class="data-note">Teslimat tahmini: {{fmt(model.points)}} SP · {{model.pointed}} iş. SP kişi saatine çevrilmez ve kapasite oranı olarak kullanılmaz; BAU bu toplamın dışındadır.</p>}
@if(model.checks.length){<details class="check-details"><summary>Eksik bilgileri gör · {{model.checks.length}} iş</summary>@for(c of model.checks;track c.task.id){<div class="check"><strong>{{c.task.name}}</strong><ul>@for(message of c.messages;track $index){<li>{{message}}</li>}</ul>@if(editable){<button type="button" class="btn small" (click)="assign.emit(c.task)">Atamaları düzenle</button>}</div>}</details>}
}@else{
<p class="data-note">Aşağıdaki değerler kaydedilmemiş taslağı içerir; eski atama çıkarılıp yeni atama eklenmiştir.</p>
@for(p of draftPeople;track p.id){<div class="person" [class.attention]="p.attention"><div><strong>{{p.name}}</strong><small>{{p.status}}</small></div><div class="person-hours"><span>{{fmt(p.hours)}} / {{p.capacity===null?'—':fmt(p.capacity)}} sa</span><small>{{p.capacity===null?'Kapasite bilinmiyor':p.over>.01?fmt(p.over)+' sa aşım':fmt(p.free)+' sa boşluk'}}</small></div></div>}
}
}
</section>`,styles:[`:host{display:block;margin-bottom:20px;min-width:0}.insights{min-width:0}.section-head{align-items:flex-start;flex-wrap:wrap}.insight-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0}.insight-metrics>div{padding:14px;background:#f7faff;border:1px solid #e1e9f4;border-radius:10px;display:grid;gap:5px}.insight-metrics small,.insight-metrics span{color:#64778f;font-size:11px}.insight-metrics strong{font-size:23px;color:#173c64}.people-details,.check-details{border-top:1px solid #e2eaf4;margin-top:14px;padding-top:14px}summary{font-weight:750;font-size:12px;cursor:pointer}.filter{display:flex;gap:8px;align-items:center;font-size:12px;margin:16px 0}.person{display:flex;gap:14px;align-items:center;padding:13px 0;border-bottom:1px solid #edf1f7;font-size:12px}.person>div:first-child{flex:1;min-width:0}.person strong,.check strong{overflow-wrap:anywhere}.person small{display:block;color:#64778f;font-size:11px;margin-top:4px}.person-hours{text-align:right;flex-shrink:0}.attention .person-hours{color:#ab3e19}.check{padding:16px 0;border-bottom:1px solid #e2eaf4;font-size:12px}.check li{margin:5px 0;color:#64778f}.draft{box-shadow:none;padding:16px}.draft h2{font-size:16px}@media(max-width:600px){.insight-metrics{grid-template-columns:repeat(2,1fr)}.person{flex-wrap:wrap}.person .btn{width:100%}.section-head h2{font-size:17px}}`]})
export class PlanningInsightsComponent implements OnChanges{
 @Input()items:Task[]=[];@Input()rows:CapacityRow[]=[];@Input()mode:ProductSettings['estimationMode']='SIZE_AND_HOURS';@Input()loaded=false;@Input()editable=false;@Input()historical=false;
 @Input()taskId='';@Input()draft:Task['assignments']=[];
 @Output()allocate=new EventEmitter<CapacityRow>();@Output()assign=new EventEmitter<Task>();
 private cdr=inject(ChangeDetectorRef);onlyAttention=false;
 model=planningInsights([],[],'SIZE_AND_HOURS');
 ngOnChanges(){this.model=planningInsights(this.taskId?assignmentPreview(this.items,this.taskId,this.draft):this.items,this.rows,this.mode);}
 get visiblePeople(){return this.model.people.filter(p=>!this.onlyAttention||p.attention);}
 get draftPeople(){const ids=new Set([...this.draft,...(this.items.find(t=>t.id===this.taskId)?.assignments||[])].map(a=>a.memberId));return this.model.people.filter(p=>ids.has(p.id));}
 fmt(n:number){return new Intl.NumberFormat('tr-TR',{maximumFractionDigits:2}).format(n);}
 changed(){this.cdr.detectChanges();}
}

