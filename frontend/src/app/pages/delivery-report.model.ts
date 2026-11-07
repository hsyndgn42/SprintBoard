import type {ProductSettings, ReportRow} from '../api.service';
import type {Figure, Mark} from './report-figure';
import {clip, line, polyline, rect, text} from './report-figure';

/**
 * Read model for the sprint delivery report.
 *
 * Every value here is derived from the rows the delivery endpoint already returns; nothing is
 * recalculated differently from the application. The delivery ratio stays what the product means
 * by it: Done work excluding BAU divided by all delivery work, weighted by item count rather than
 * averaged per sprint.
 */

export const DELIVERY_COLORS={
 rate:'#1b6b63',rateLatest:'#0f4c47',best:'#2e7d61',worst:'#c0362c',
 intake:'#93a7b8',delivered:'#1f6f78',
 small:'#8fb8dd',medium:'#2f6a9e',large:'#6b5ca5',xlarge:'#3f3a63',unsized:'#c3ccd3',
} as const;

const tr=new Intl.NumberFormat('tr-TR',{maximumFractionDigits:1});
export const num=(value:number)=>tr.format(value);
export const items=(count:number)=>num(count)+' iş';
export const percent=(value:number|null)=>value==null?'—':'%'+num(value);
export const stamp=(at:Date)=>new Intl.DateTimeFormat('tr-TR',{dateStyle:'long',timeStyle:'short'}).format(at);

/**
 * Turkish locative suffix, so findings read as sentences instead of as data dumps.
 * Sprint names usually end in a number, which is pronounced, so the digits decide the vowel.
 */
const DIGIT_SUFFIX:Record<string,string>={'0':'da','1':'de','2':'de','3':'te','4':'te','5':'te','6':'da','7':'de','8':'de','9':'da'};
const TENS_SUFFIX:Record<string,string>={'1':'da','2':'de','3':'da','4':'ta','5':'de','6':'ta','7':'te','8':'de','9':'da'};
export function locative(name:string):string{
 const digits=/(\d+)\s*$/.exec(name);
 if(digits){
  const value=digits[1];
  const suffix=value.length>1&&value.endsWith('0')?TENS_SUFFIX[value[value.length-2]]??'da':DIGIT_SUFFIX[value[value.length-1]]??'da';
  return name+'’'+suffix;
 }
 const vowels=name.toLocaleLowerCase('tr-TR').match(/[aeıioöuü]/g);
 const back=!vowels||'aıou'.includes(vowels[vowels.length-1]);
 const voiceless='fstkçşhp'.includes(name[name.length-1]?.toLocaleLowerCase('tr-TR')??'');
 return name+'’'+(voiceless?(back?'ta':'te'):(back?'da':'de'));
}

export interface DeliverySprint{
 id:string;number:number;name:string;end:string;
 intake:number;bau:number;allTasks:number;done:number;undone:number;rate:number|null;
 storyPoints:number;pointed:number;
 sizes:{label:string;count:number;fill:string}[];
}

export interface DeliveryReport{
 sprints:DeliverySprint[];          // newest first, the order every section of the report uses
 sprintCount:number;
 totalIntake:number;totalDone:number;totalUndone:number;
 overallRate:number|null;           // totalDone * 100 / totalIntake, rounded; null when no intake
 latest:DeliverySprint|null;        // highest sprint number, the most recently completed
 best:DeliverySprint|null;worst:DeliverySprint|null;
 averageIntake:number|null;averageDone:number|null;
 sizeMode:boolean;                  // SIZE_AND_HOURS teams estimate in Size, others in Story Point
 sizeTotals:{label:string;count:number;share:number;fill:string}[];
 sizedTotal:number;storyPoints:number;pointedTasks:number;
 findings:string[];
}

const SIZE_BANDS=[
 {label:'Small',fill:DELIVERY_COLORS.small},
 {label:'Medium',fill:DELIVERY_COLORS.medium},
 {label:'Large',fill:DELIVERY_COLORS.large},
 {label:'XL',fill:DELIVERY_COLORS.xlarge},
];

const rounded=(part:number,total:number)=>total?Math.round(part*100/total):null;

export function buildDeliveryReport(rows:ReportRow[],settings:ProductSettings):DeliveryReport{
 const sizeMode=settings.estimationMode==='SIZE_AND_HOURS';
 const sprints:DeliverySprint[]=[...rows].sort((a,b)=>b.number-a.number).map(r=>({
  id:r.id,number:r.number,name:r.name,end:r.end,
  intake:r.tasks,bau:Math.max(0,r.allTasks-r.tasks),allTasks:r.allTasks,done:r.done,undone:r.undone,rate:r.deliveryRate,
  storyPoints:r.storyPointsTotal,pointed:r.pointedTasks,
  sizes:[r.sizeSmall,r.sizeMedium,r.sizeLarge,r.sizeXLarge].map((count,i)=>({label:SIZE_BANDS[i].label,count,fill:SIZE_BANDS[i].fill})),
 }));
 const totalIntake=sprints.reduce((n,s)=>n+s.intake,0);
 const totalDone=sprints.reduce((n,s)=>n+s.done,0);
 const totalUndone=sprints.reduce((n,s)=>n+s.undone,0);
 const rated=sprints.filter(s=>s.rate!==null);
 const ranked=[...rated].sort((a,b)=>(b.rate??0)-(a.rate??0));
 const sizeTotals=SIZE_BANDS.map((band,i)=>({
  label:band.label,fill:band.fill,share:0,
  count:sprints.reduce((n,s)=>n+s.sizes[i].count,0),
 }));
 const sizedTotal=sizeTotals.reduce((n,s)=>n+s.count,0);
 // Shares are rounded per slice and may therefore sum to 99 or 101; the data is not nudged to hide it.
 for(const slice of sizeTotals)slice.share=sizedTotal?Math.round(slice.count*100/sizedTotal):0;
 const report:DeliveryReport={
  sprints,sprintCount:sprints.length,totalIntake,totalDone,totalUndone,
  overallRate:rounded(totalDone,totalIntake),
  latest:sprints[0]??null,
  best:ranked[0]??null,worst:ranked.length>1?ranked[ranked.length-1]:null,
  averageIntake:sprints.length?Math.round(totalIntake/sprints.length):null,
  averageDone:sprints.length?Math.round(totalDone/sprints.length):null,
  sizeMode,sizeTotals,sizedTotal,
  storyPoints:rows.reduce((n,r)=>n+r.storyPointsTotal,0),
  pointedTasks:rows.reduce((n,r)=>n+r.pointedTasks,0),
  findings:[],
 };
 report.findings=findingsOf(report);
 return report;
}

/** Only statements the rows prove. No causes, no judgement, no targets. */
export function findingsOf(report:DeliveryReport):string[]{
 const out:string[]=[];
 if(!report.sprintCount)return out;
 out.push(report.sprintCount+' tamamlanan sprintte '+items(report.totalDone)+' teslim edildi.');
 if(report.overallRate!==null)out.push('Genel teslimat oranı '+percent(report.overallRate)+' olarak gerçekleşti.');
 if(report.latest?.rate!=null)out.push('Son tamamlanan '+locative(report.latest.name)+' teslimat oranı '+percent(report.latest.rate)+' oldu.');
 if(report.best&&report.worst){
  out.push('En yüksek teslimat oranı '+locative(report.best.name)+' '+percent(report.best.rate)+' oldu.');
  out.push('En düşük teslimat oranı '+locative(report.worst.name)+' '+percent(report.worst.rate)+' oldu.');
 }
 out.push(report.totalUndone>0?items(report.totalUndone)+' Undone kapandı.':'Hiçbir sprint Undone iş bırakmadı.');
 if(report.sizeMode&&report.sizedTotal)out.push('Boyut kaydı bulunan '+items(report.sizedTotal)+' içinde en yoğun grup '+
  [...report.sizeTotals].sort((a,b)=>b.count-a.count)[0].label+' ('+percent([...report.sizeTotals].sort((a,b)=>b.count-a.count)[0].share)+').');
 return out;
}

export const SIZE_NOTE='Ekip göreli tahminde Size, kapasite ve atamalarda saat kullanır. Size saatten türetilmez.';
export const RATE_NOTE='Teslimat oranı: BAU hariç Done iş / tüm teslimat işleri.';

export const DELIVERY_METHODOLOGY=[
 {term:'Teslimat oranı',text:'BAU hariç Done işin tüm teslimat işlerine bölümüdür. Genel oran sprint ortalaması değil, iş adedi ağırlıklı orandır.'},
 {term:'BAU',text:'Rutin işler teslimat oranına ve Done sayısına katılmaz; tabloda ayrı sütunda ve BAU dahil toplamda görünür.'},
 {term:'Done',text:'Sprint sonunda tamamlanmış kabul edilen iş. Done sayıları BAU hariçtir.'},
 {term:'Undone',text:'Sprint kapanırken tamamlanmamış iş. Kapsamdan çıkarılan iş Undone sayılmaz.'},
 {term:'Teslimat işi olmayan sprint',text:'Oran üretilmez ve — olarak gösterilir; sıfır teslimat sayılmaz.'},
 {term:'Aktif sprint',text:'Rapor tamamlanan sprintleri kapsar. Aktif sprint seçime dahil edilirse sonuçları kesin değildir.'},
 {term:'Size',text:'Göreli büyüklük tahminidir. Saate çevrilmez ve iyi/kötü anlamı taşımaz.'},
 {term:'Size ve saat',text:SIZE_NOTE},
 {term:'Tarih',text:'Bitiş tarihi sprintin kapanış tarihidir; rapor zamanı tarayıcının yerel saatidir.'},
 {term:'Yuvarlama',text:'Yüzdeler tam sayıya yuvarlanır. Dağılım yüzdeleri yuvarlama nedeniyle 99 veya 101 toplayabilir; veri düzeltilmez.'},
];

/* --------------------------------------------------------------------- figures */

/** 7. Delivery trend: one point per completed sprint on a fixed 0–100 scale. */
export function trendFigure(report:DeliveryReport):Figure{
 const rows=[...report.sprints].reverse(),left=42,right=16,top=18,plot=200;
 const step=Math.max(54,Math.min(96,Math.round(820/Math.max(1,rows.length))));
 const W=left+right+Math.max(step,step*rows.length),H=top+plot+54;
 const marks:Mark[]=[];
 const x=(i:number)=>left+step*i+step/2;
 const y=(value:number)=>top+plot-plot*value/100;
 for(const grid of [0,25,50,75,100]){
  marks.push(line(left,y(grid),W-right,y(grid),grid===0?'zero':'axis'));
  marks.push(text(left-8,y(grid)+4,'%'+grid,'unit','end'));
 }
 const rated=rows.filter(r=>r.rate!==null);
 if(rated.length>1)marks.push(polyline(rated.map(r=>[x(rows.indexOf(r)),y(r.rate!)] as [number,number]),DELIVERY_COLORS.rate));
 // Labels are thinned, never the data: every sprint keeps its point, tooltip and text equivalent.
 const everyOther=step<64&&rows.length>8;
 rows.forEach((row,i)=>{
  const px=x(i),last=i===rows.length-1;
  marks.push(text(px,top+plot+22,clip(row.name.replace(/^Sprint\s*/i,'S'),9),'label','middle'));
  if(row.rate===null){marks.push(text(px,top+plot-8,'—','unit','middle'));return;}
  const py=y(row.rate),best=report.best?.id===row.id,worst=report.worst?.id===row.id;
  const fill=best?DELIVERY_COLORS.best:worst?DELIVERY_COLORS.worst:last?DELIVERY_COLORS.rateLatest:DELIVERY_COLORS.rate;
  const size=last||best||worst?5:3.5;
  marks.push(rect(px-size,py-size,size*2,size*2,fill,size));
  if(!everyOther||i%2===0||last||best||worst)marks.push(text(px,py-12,'%'+row.rate,'value','middle'));
  if(best)marks.push(text(px,top+plot+38,'en yüksek','unit','middle'));
  else if(worst)marks.push(text(px,top+plot+38,'en düşük','unit','middle'));
  else if(last)marks.push(text(px,top+plot+38,'son sprint','unit','middle'));
 });
 return {id:'teslimat-trendi',width:W,height:H,title:'Sprint bazlı teslimat oranı',
  desc:rows.map(r=>r.name+': '+(r.rate===null?'oran yok':percent(r.rate))).join(', ')+'. '+RATE_NOTE,
  marks,empty:rows.length?undefined:'Tamamlanan sprint yok.'};
}

/** 8. Intake against delivered work, one grouped pair per sprint. */
export function intakeFigure(report:DeliveryReport):Figure{
 const rows=report.sprints,labelW=118,valueW=190,W=940,rowH=46,top=26;
 const arm=W-labelW-valueW;
 const peak=Math.max(1,...rows.map(r=>r.intake));
 const marks:Mark[]=[];
 marks.push(text(labelW,14,'Sprinte alınan ve teslim edilen iş','unit','start'));
 rows.forEach((row,i)=>{
  const y=top+i*rowH;
  marks.push(text(0,y+18,clip(row.name,16),'label','start'));
  marks.push(rect(labelW,y+2,arm*row.intake/peak,13,DELIVERY_COLORS.intake,2));
  marks.push(rect(labelW,y+19,arm*row.done/peak,13,DELIVERY_COLORS.delivered,2));
  marks.push(text(W-valueW+10,y+13,'Alınan '+row.intake+' · Teslim '+row.done,'value','start'));
  marks.push(text(W-valueW+10,y+30,'Fark '+(row.intake-row.done)+' · '+percent(row.rate),'unit','start'));
 });
 return {id:'alinan-teslim',width:W,height:top+rows.length*rowH+8,title:'Alınan iş ile teslim edilen iş',
  desc:rows.map(r=>r.name+': '+r.intake+' alındı, '+r.done+' teslim edildi, fark '+(r.intake-r.done)+', teslimat '+percent(r.rate)).join('. ')+'.',
  marks,empty:rows.length?undefined:'Tamamlanan sprint yok.'};
}

/** 9. Size composition as one stacked bar; zero categories keep their legend row but no width. */
export function sizeFigure(report:DeliveryReport):Figure{
 const W=720,total=Math.max(1,report.sizedTotal);
 const marks:Mark[]=[];let x=0,y=70;
 marks.push(text(0,12,'Boyut kaydı bulunan '+items(report.sizedTotal),'unit','start'));
 for(const slice of report.sizeTotals){
  const w=W*slice.count/total;
  if(slice.count){
   marks.push(rect(x,20,w,34,slice.fill,2));
   if(w>72)marks.push(text(x+w/2,42,slice.label+' · '+percent(slice.share),'inverse','middle'));
   x+=w;
  }
  marks.push(rect(0,y-9,10,10,slice.count?slice.fill:DELIVERY_COLORS.unsized,2));
  marks.push(text(16,y,slice.label+' · '+items(slice.count)+' · '+percent(slice.share),'label','start'));
  y+=16;
 }
 return {id:'boyut-dagilimi',width:W,height:62+report.sizeTotals.length*16,title:'İşlerin büyüklük dağılımı',
  desc:report.sizeTotals.map(s=>s.label+': '+items(s.count)+', '+percent(s.share)).join('. ')+'. '+SIZE_NOTE,
  marks,empty:report.sizedTotal?undefined:'Boyut kaydı bulunan iş yok.'};
}
