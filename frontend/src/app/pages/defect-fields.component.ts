import { Component,Input,Output,EventEmitter } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BacklogItem,TeamMember } from '../api.service';
import { DefectDetails,emptyDefect,severityOptions,environmentOptions } from '../defect-model';

@Component({selector:'app-defect-fields',standalone:true,imports:[FormsModule],template:`
  <section class="defect-fields"><h3>Defect bilgileri</h3><p class="data-note">Önem hatanın etkisidir; backlog önceliğinden ayrıdır. Alanlar isteğe bağlıdır, görev durumunu değiştirmez.</p>
    <div class="form-grid two"><label class="field">Önem derecesi<select name="defectSeverity" [ngModelOptions]="{standalone:true}" [ngModel]="value.severity" (ngModelChange)="set('severity',$event)">@for(o of severities;track o.value){<option [value]="o.value">{{ o.label }}</option>}</select></label><label class="field">Görüldüğü ortam<select name="defectEnvironment" [ngModelOptions]="{standalone:true}" [ngModel]="value.environment" (ngModelChange)="set('environment',$event)">@for(o of environments;track o.value){<option [value]="o.value">{{ o.label }}</option>}</select></label></div>
    <label class="field">İlgili geliştirme / test işi<select name="defectRelated" [ngModelOptions]="{standalone:true}" [ngModel]="value.relatedId" (ngModelChange)="set('relatedId',$event)"><option [ngValue]="null">Bağlantı yok</option>@for(item of options;track item.id){<option [ngValue]="item.id">{{ item.title }}</option>}</select>@if(!options.length){<small>Aktif sprintte test işi yok.</small>}@else{<small>Aktif sprintteki test işleri listelenir.</small>}</label>
    @if(value.reporterId){<p>Bildiren: {{ value.reporterName || 'Ad soyad bekleniyor' }}</p>@if(value.sourceUrl){<a [href]="value.sourceUrl" target="_blank" rel="noopener noreferrer">Kaynak Slack mesajı ↗</a>}}
  </section>
`,styles:[`.defect-fields{display:grid;gap:14px;padding:16px;border:1px solid #dae5f2;border-radius:12px;background:#f8fbff}.defect-fields h3,.defect-fields p{margin:0}.form-grid.two{align-items:start}`]})
export class DefectFieldsComponent {
  @Input() value:DefectDetails=emptyDefect();@Input() items:BacklogItem[]=[];@Input() members:TeamMember[]=[];@Input() itemId:string|null=null;
  @Output() valueChange=new EventEmitter<DefectDetails>();severities=severityOptions;environments=environmentOptions;
  /**
   * A defect is reported against the test work that found it, so only test items
   * living in the running sprint are offered. An already stored link stays in the
   * list even once its sprint closes, otherwise saving would silently drop it.
   */
  get options(){const open=this.items.filter(i=>i.id!==this.itemId&&i.taskCategory==='TEST'&&i.sprintStatus==='active');
    const current=this.value.relatedId?this.items.find(i=>i.id===this.value.relatedId):null;
    return current&&!open.some(i=>i.id===current.id)?[current,...open]:open;}
  set(key:keyof DefectDetails,value:string|null){this.value={...this.value,[key]:value};this.valueChange.emit(this.value);}
}
