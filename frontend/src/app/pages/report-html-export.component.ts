import {ChangeDetectorRef,Component,Input,inject} from '@angular/core';
import type {ReportExport} from './report-export.model';
import {downloadText} from './share-export';

@Component({selector:'app-report-html-export',standalone:true,template:`
<button type="button" class="btn primary" [disabled]="disabled||busy" (click)="download()">{{busy?'HTML hazırlanıyor…':'HTML indir'}}</button>
@if(error){<p role="alert" class="export-error">{{error}}</p>}
`,styles:[`:host{display:inline-flex;flex-direction:column;align-items:flex-end;gap:6px;min-width:0}.export-error{font-size:12px;color:#ae3028;max-width:260px;margin:0}@media print{:host{display:none!important}}`]})
export class ReportHtmlExportComponent {
 @Input({required:true}) report!:ReportExport;
 @Input() disabled=false;
 private cdr=inject(ChangeDetectorRef);busy=false;error='';
 async download(){
  if(this.disabled||this.busy)return;
  this.busy=true;this.error='';
  try{
   // Freeze the selected scope before the lazy export module loads.
   const snapshot=structuredClone(this.report);
   const {reportTabHtml}=await import('./report-tab-html');
   downloadText(reportTabHtml(snapshot),'text/html;charset=utf-8','sprintboard-'+snapshot.kind+'-raporu.html');
  }catch{this.error='HTML oluşturulamadı. Tekrar deneyin.';}
  finally{this.busy=false;this.cdr.detectChanges();}
 }
}
