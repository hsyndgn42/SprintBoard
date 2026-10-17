import {Component,Input,OnChanges,ViewEncapsulation} from '@angular/core';
import {Sprint} from '../api.service';
import {scopeCss,scopeSectionHtml} from './scope-summary.model';
@Component({selector:'app-scope-summary',standalone:true,template:'<div [innerHTML]="html"></div>',styles:[scopeCss],encapsulation:ViewEncapsulation.None})
export class ScopeSummaryComponent implements OnChanges{
 @Input({required:true}) sprint!:Sprint;html='';
 ngOnChanges(){this.html=scopeSectionHtml(this.sprint);}
}
