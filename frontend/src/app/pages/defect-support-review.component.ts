import {Component,Input,OnChanges,ViewEncapsulation} from '@angular/core';
import {Sprint} from '../api.service';
import {supportDefectsHtml} from './defect-support-review';
@Component({selector:'app-defect-support-review',standalone:true,encapsulation:ViewEncapsulation.None,template:'<div [innerHTML]="html"></div>',styles:[`app-defect-support-review .support-defects{margin:24px 0;padding:24px;border:1px solid #dce5f0;border-radius:14px;background:#fff;color:#17324f}app-defect-support-review .support-summary-grid{display:flex;flex-wrap:wrap;gap:16px}app-defect-support-review .support-summary-card{flex:1;min-width:180px;border:1px solid #dce5f0;border-radius:12px;padding:18px}app-defect-support-review progress{width:100%;accent-color:#0d9274}app-defect-support-review ul{list-style:none;padding:0;margin-bottom:0}app-defect-support-review li{border-top:1px solid #e2e9f2;padding:14px 0;overflow-wrap:anywhere}app-defect-support-review h2{margin:8px 0 12px}app-defect-support-review small{color:#586e86}`]})
export class DefectSupportReviewComponent implements OnChanges {
 @Input({required:true})sprint!:Sprint;html='';
 ngOnChanges(){this.html=supportDefectsHtml(this.sprint);}
}
