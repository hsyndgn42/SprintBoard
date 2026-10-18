import { FoldDirective } from '../fold.directive';
import {Component,Input,OnChanges,ViewEncapsulation} from '@angular/core';
import {Sprint} from '../api.service';
import {scopeCss,scopeSectionHtml} from './scope-summary.model';
@Component({selector:'app-scope-summary',standalone:true,imports:[FoldDirective],template:'<details appFold class="card card-pad"><summary><h2>Acil işler ve kapsam değişimi</h2></summary><div class="folded-scope" [innerHTML]="html"></div></details>',styles:[scopeCss,'.folded-scope .scope-summary{border:0;margin:0;padding:0}.folded-scope .scope-summary>h2{display:none}'],encapsulation:ViewEncapsulation.None})
export class ScopeSummaryComponent implements OnChanges{
 @Input({required:true}) sprint!:Sprint;html='';
 ngOnChanges(){this.html=scopeSectionHtml(this.sprint);}
}
