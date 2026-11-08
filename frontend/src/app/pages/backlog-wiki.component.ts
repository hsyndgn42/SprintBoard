import {ChangeDetectorRef, Component, Input, OnDestroy, inject} from '@angular/core';
import {DatePipe, DecimalPipe} from '@angular/common';
import {RouterLink} from '@angular/router';
import {ApiService, BacklogItem} from '../api.service';
import {ListPagerComponent} from '../list-pager.component';
import {ModalAccessibilityDirective} from '../modal-accessibility.directive';
import {SbToastService} from '../shared/sb-toast';

interface WikiStatus {
  enabled:boolean; configured:boolean; pageId:string; pageUrl:string;
  lastPublish:{publishedAt:string;itemCount:number;scope:string}|null;
}
interface WikiRow {
  id:string; title:string; typeLabel:string; roadmap:string; priority:string;
  stateLabel:string; sprint:string; estimatedHours:number; estimate:string; jiraKey:string; jiraUrl:string;
}
interface WikiPreview {
  pageId:string; pageUrl:string; pageTitle:string; pageVersion:number; generatedAt:string;
  fingerprint:string; scope:string; itemIds:string[]; rows:WikiRow[];
  excludedLeave:number; pool:number; planned:number; active:number;
}

@Component({
  selector:'app-backlog-wiki', standalone:true,
  imports:[DatePipe,DecimalPipe,RouterLink,ListPagerComponent,ModalAccessibilityDirective],
  template:`
    <button type="button" class="btn" [disabled]="disabled || busy" (click)="open()">Wikiye gönder</button>
    @if(opened){
      <div class="modal-layer"><section class="modal wiki-modal" [attr.aria-busy]="busy">
        <header><span class="eyebrow">CONFLUENCE · BACKLOG</span><h2>Wiki gönderimini önizle</h2></header>
        <div class="modal-body">
          @if(busy){<p class="data-note" role="status">{{publishing ? 'Wiki sayfası güncelleniyor…' : 'Hedef sayfa ve işler okunuyor…'}}</p>}
          @if(error){<p class="notice warn" role="alert">{{error}}</p>}
          @if(status && (!status.enabled || !status.configured)){
            <p>Wikiye göndermek için Confluence bağlantısını açıp Backlog sayfa ID’sini kaydedin.</p>
            <a class="btn" routerLink="/settings" [queryParams]="{tab:'integrations'}" (click)="close()">Confluence ayarlarına git</a>
          }
          @if(preview; as p){
            <div class="wiki-target"><div><span class="eyebrow">HEDEF SAYFA</span><h3>{{p.pageTitle}}</h3><p>Sayfa {{p.pageId}} · Sürüm {{p.pageVersion}} → {{p.pageVersion + 1}}</p></div><a class="btn small" [href]="p.pageUrl" target="_blank" rel="noopener noreferrer">Wiki sayfasını aç ↗</a></div>
            <p class="notice">Bu sayfanın içeriği aşağıdaki Backlog görünümüyle değiştirilecek. Sayfa başlığı korunacak.</p>
            <div class="wiki-counts"><div><span>Gönderilecek iş</span><strong>{{p.rows.length}}</strong></div><div><span>Havuzda</span><strong>{{p.pool}}</strong></div><div><span>Planlanan sprintte</span><strong>{{p.planned}}</strong></div><div><span>Aktif sprintte</span><strong>{{p.active}}</strong></div></div>
            <p class="wiki-scope"><strong>Kapsam:</strong> {{p.scope}}</p>
            <p class="data-note">Seçili filtrelere uyan tüm sayfalardaki işler gönderilir. Wiki’de işler türlerine göre gruplanır.@if(p.excludedLeave){ {{p.excludedLeave}} izin işi paylaşım dışında tutuldu.}</p>
            @if(!p.rows.length){<p class="notice warn">Bu görünümde paylaşılacak iş yok. Gönderirseniz wiki sayfası boş liste özetiyle güncellenir.</p>}
            <app-list-pager #pager [items]="p.rows" [size]="20" label="Wiki önizleme" />
            @if(p.rows.length){<div class="table-scroll"><table><thead><tr><th>İş / tür</th><th>Roadmap</th><th>Öncelik</th><th>Durum / Sprint</th><th class="wiki-hours">Tahmin</th><th>PBI</th></tr></thead><tbody>
              @for(row of pager.rows;track row.id){<tr><td><strong>{{row.title}}</strong><small>{{row.typeLabel}}</small></td><td>{{row.roadmap || 'Roadmap bağlantısı yok'}}</td><td>{{row.priority}}</td><td>{{row.stateLabel}}<small>{{row.sprint}}</small></td><td class="wiki-hours">{{row.estimatedHours > 0 ? (row.estimatedHours | number:'1.0-2') + ' sa' : 'Saat belirtilmedi'}}<small>{{row.estimate}}</small></td><td>@if(row.jiraUrl){<a [href]="row.jiraUrl" target="_blank" rel="noopener noreferrer">{{row.jiraKey}}</a>}@else{ {{row.jiraKey || '—'}} }</td></tr>}
            </tbody></table></div>}
            @if(status?.lastPublish;as last){<p class="data-note">Son gönderim: {{last.publishedAt | date:'dd.MM.yyyy HH:mm':'+0300'}} (Türkiye) · {{last.itemCount}} iş</p>}
          }
        </div>
        <footer><button data-modal-dismiss type="button" class="btn" [disabled]="busy" (click)="close()">Vazgeç</button><button type="button" class="btn" [disabled]="busy" (click)="loadPreview()">Önizlemeyi yenile</button><button type="button" class="btn primary" [disabled]="busy || !preview" (click)="publish()">Wiki sayfasını güncelle</button></footer>
      </section></div>
    }
  `,
  styles:[`
    :host{display:inline-flex}.wiki-modal{width:min(1150px,96vw);max-width:1150px}.wiki-target{display:flex;justify-content:space-between;align-items:center;gap:16px}.wiki-target h3{margin:5px 0}.wiki-target p{margin:4px 0;color:var(--muted,#64748b);font-size:12px}
    .wiki-counts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:20px 0}.wiki-counts>div{padding:16px;border:1px solid var(--border,#dce5ef);border-radius:10px;background:var(--surface,#f7f9fc)}.wiki-counts span{display:block;font-size:12px;color:var(--muted,#64748b)}.wiki-counts strong{display:block;font-size:26px;margin-top:5px;font-variant-numeric:tabular-nums}.wiki-scope{overflow-wrap:anywhere}
    table{width:100%;min-width:760px}td{vertical-align:top}td:first-child{min-width:210px;max-width:320px;overflow-wrap:anywhere}td small{display:block;margin-top:5px;color:var(--muted,#64748b);font-size:12px}.wiki-hours{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.table-scroll{overflow-x:auto}footer{flex-wrap:wrap}
    @media(max-width:650px){.wiki-counts{grid-template-columns:repeat(2,minmax(0,1fr))}.wiki-target{align-items:flex-start;flex-direction:column}}
  `],
})
export class BacklogWikiComponent implements OnDestroy {
  @Input() items:BacklogItem[]=[];
  @Input() scope='';
  @Input() disabled=false;
  private api=inject(ApiService); private cdr=inject(ChangeDetectorRef); private toast=inject(SbToastService);
  private destroyed=false;
  opened=false; busy=false; publishing=false; error=''; status:WikiStatus|null=null; preview:WikiPreview|null=null;
  ngOnDestroy(){this.destroyed=true;}
  private refresh(){if(!this.destroyed)this.cdr.detectChanges();}
  async open(){this.opened=true;await this.loadPreview();}
  close(){if(!this.busy){this.opened=false;this.preview=null;this.refresh();}}
  async loadPreview(){
    if(this.busy)return;
    const selection={itemIds:this.items.map(item=>item.id),scope:this.scope};
    this.busy=true;this.error='';this.preview=null;this.status=null;this.refresh();
    try{
      this.status=await this.api.get<WikiStatus>('/admin/confluence/backlog');
      if(this.status.enabled && this.status.configured)this.preview=await this.api.post<WikiPreview>('/admin/confluence/backlog/preview',selection);
    }catch(e){this.error=String(e);}
    finally{this.busy=false;this.refresh();}
  }
  async publish(){
    if(this.busy || !this.preview)return;
    const p=this.preview;
    this.busy=true;this.publishing=true;this.error='';this.refresh();
    try{
      const result=await this.api.post<{itemCount:number;pageVersion:number}>('/admin/confluence/backlog',{itemIds:p.itemIds,scope:p.scope,generatedAt:p.generatedAt,fingerprint:p.fingerprint,confirmed:true});
      this.toast.success(`Backlog wiki sayfası güncellendi · ${result.itemCount} iş · Sürüm ${result.pageVersion}`);
      this.opened=false;this.preview=null;
    }catch(e){this.error=String(e);this.preview=null;}
    finally{this.busy=false;this.publishing=false;this.refresh();}
  }
}
