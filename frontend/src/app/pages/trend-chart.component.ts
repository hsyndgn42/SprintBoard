import {Component,Input} from '@angular/core';
import {TrendSeries,trendMax,trendX,trendY,trendPoints,round} from './operational-trends.model';
@Component({selector:'app-trend-chart',standalone:true,template:`
<svg viewBox="0 0 720 230" role="img" [attr.aria-label]="title">
 @for(f of [0,0.5,1];track f){<line x1="52" x2="668" [attr.y1]="y(max*f,max)" [attr.y2]="y(max*f,max)" stroke="#dce5ef"/><text x="42" [attr.y]="y(max*f,max)+4" text-anchor="end">{{round(max*f)}}</text>}
 @for(s of series;track s.label){<polyline [attr.points]="points(s,labels.length,max)" fill="none" [attr.stroke]="s.color" stroke-width="3"/>@for(v of s.values;track $index;let i=$index){<circle [attr.cx]="x(i,labels.length)" [attr.cy]="y(v,max)" r="4" [attr.fill]="s.color"><title>{{labels[i]}} · {{s.label}}: {{v}} {{unit}}</title></circle>}}
 @for(l of labels;track $index;let i=$index){@if(i%labelStep===0||i===labels.length-1){<text [attr.x]="x(i,labels.length)" y="216" text-anchor="middle">{{l}}</text>}}
</svg>
<div class="trend-legend">@for(s of series;track s.label){<span><i [style.background]="s.color"></i>{{s.label}}</span>}<small>{{unit}}</small></div>`,
styles:[`:host{display:block;min-width:0}svg{display:block;width:100%;height:auto}text{font-size:11px;fill:#64748b}.trend-legend{display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:#526579}.trend-legend span{display:flex;gap:6px;align-items:center}.trend-legend i{width:10px;height:10px;border-radius:3px}`]})
export class TrendChartComponent{
 @Input() labels:string[]=[];@Input() series:TrendSeries[]=[];@Input() title='Sprint trendi';@Input() unit='iş';
 x=trendX;y=trendY;points=trendPoints;round=round;
 get max(){return trendMax(this.series)}get labelStep(){return Math.max(1,Math.ceil(this.labels.length/10))}
}
