/**
 * Regression cover for the "Sprint Teslimatı" report.
 *
 * The reading model and the standalone export are free of Angular imports, so they can be checked
 * with the TypeScript compiler and Node alone. Every row here is synthetic: no production sprint
 * number or live count may reach an assertion, because those change every fortnight and a test
 * that tracks them stops being a test.
 */
import type {ProductSettings,ReportRow} from '../src/app/api.service';
import {
 DELIVERY_METHODOLOGY,RATE_NOTE,SIZE_NOTE,
 buildDeliveryReport,intakeFigure,locative,percent,sizeFigure,trendFigure,
} from '../src/app/pages/delivery-report.model';
import {deliveryReportHtml} from '../src/app/pages/delivery-report-html';

declare const process:{exitCode?:number};

let failed=0,ran=0;
function test(name:string,body:()=>void){
 ran++;
 try{body();}
 catch(error){failed++;console.error('  FAIL  '+name+'\n         '+(error instanceof Error?error.message:String(error)));}
}
function eq(actual:unknown,expected:unknown,what:string){
 if(!Object.is(actual,expected))throw new Error(what+': beklenen '+JSON.stringify(expected)+', gelen '+JSON.stringify(actual));
}
function ok(value:unknown,what:string){if(!value)throw new Error(what);}
function has(haystack:string,needle:string,what:string){if(!haystack.includes(needle))throw new Error(what+': "'+needle+'" bulunamadı');}
function hasNot(haystack:string,needle:string,what:string){if(haystack.includes(needle))throw new Error(what+': "'+needle+'" bulunmamalıydı');}

// ---------------------------------------------------------------- synthetic data

const HOSTILE='<script>alert("xss")</script> & "tırnak" \'tek\' <img src=x onerror=1>';
const LONG='Çok uzun bir sprint adı şğüöçİı '.repeat(8);

const SIZE_SETTINGS:ProductSettings={estimationMode:'SIZE_AND_HOURS',hoursPerDay:8};
const POINT_SETTINGS:ProductSettings={estimationMode:'POINTS_AND_HOURS',hoursPerDay:8};

function row(over:Partial<ReportRow>&{id:string;number:number;name:string}):ReportRow{
 return {end:'2026-01-16',tasks:0,allTasks:0,done:0,undone:0,deliveryRate:null,
  sizedTasks:0,sizeXSmall:0,sizeSmall:0,sizeMedium:0,sizeLarge:0,sizeXLarge:0,
  pointedTasks:0,storyPointsTotal:0,storyPointsAvailable:false,...over} as ReportRow;
}

/** Three sprints with a clear best, a clear worst and a latest that is neither. */
const rows:ReportRow[]=[
 row({id:'s1',number:1,name:'Sprint Bir',end:'2026-01-16',tasks:10,allTasks:13,done:9,undone:1,deliveryRate:90,
  sizeXSmall:1,sizeSmall:1,sizeMedium:6,sizeLarge:2,sizeXLarge:0,pointedTasks:10,storyPointsTotal:30}),
 row({id:'s2',number:2,name:'Sprint İki',end:'2026-01-30',tasks:20,allTasks:20,done:10,undone:10,deliveryRate:50,
  sizeSmall:4,sizeMedium:10,sizeLarge:6,sizeXLarge:0,pointedTasks:18,storyPointsTotal:70}),
 row({id:'s3',number:3,name:LONG,end:'2026-02-13',tasks:10,allTasks:16,done:7,undone:3,deliveryRate:70,
  sizeSmall:1,sizeMedium:5,sizeLarge:3,sizeXLarge:1,pointedTasks:9,storyPointsTotal:25}),
];

const report=buildDeliveryReport(rows,SIZE_SETTINGS);
const empty=buildDeliveryReport([],SIZE_SETTINGS);

// ---------------------------------------------------------------- summary

test('newest sprint leads every section',()=>{
 eq(report.sprints[0].number,3,'ilk satır');
 eq(report.sprints[report.sprints.length-1].number,1,'son satır');
});

test('totals come from the rows, not from a cached count',()=>{
 eq(report.sprintCount,3,'sprint sayısı');
 eq(report.totalIntake,40,'alınan iş');
 eq(report.totalDone,26,'teslim edilen iş');
 eq(report.totalUndone,14,'undone');
});

test('overall ratio is work weighted, not an average of sprint ratios',()=>{
 eq(report.overallRate,65,'genel oran');            // 26/40, not (90+50+70)/3
});

test('BAU stays out of intake and done but remains visible as its own column',()=>{
 const s1=report.sprints.find(s=>s.id==='s1')!;
 eq(s1.intake,10,'alınan');eq(s1.bau,3,'BAU');eq(s1.allTasks,13,'BAU dahil toplam');
 eq(report.totalDone,26,'Done BAU içermez');
});

test('best, worst and latest are distinguished',()=>{
 eq(report.best?.number,1,'en yüksek');
 eq(report.worst?.number,2,'en düşük');
 eq(report.latest?.number,3,'son tamamlanan');
});

test('averages round to whole work items',()=>{
 eq(report.averageIntake,13,'ortalama alınan');
 eq(report.averageDone,9,'ortalama teslim');
});

test('no completed sprint produces an empty report rather than zeros',()=>{
 eq(empty.sprintCount,0,'sprint sayısı');
 eq(empty.overallRate,null,'oran');
 eq(empty.latest,null,'son sprint');
 eq(empty.best,null,'en yüksek');
 eq(empty.findings.length,0,'bulgu');
});

test('a sprint with no delivery work yields no ratio and is not counted as zero',()=>{
 const only=buildDeliveryReport([row({id:'x',number:9,name:'Sprint Dokuz',tasks:0,allTasks:4,done:0,undone:0,deliveryRate:null})],SIZE_SETTINGS);
 eq(only.overallRate,null,'sıfır payda');
 eq(only.best,null,'oranı olmayan sprint en iyi olamaz');
 eq(percent(null),'—','boş oran gösterimi');
});

test('a single rated sprint has no low/high comparison',()=>{
 const one=buildDeliveryReport([rows[0]],SIZE_SETTINGS);
 eq(one.best?.number,1,'tek sprint en yüksek');
 eq(one.worst,null,'tek sprintte en düşük üretilmez');
});

// ---------------------------------------------------------------- findings

test('findings only state what the rows prove',()=>{
 const text=report.findings.join(' ');
 has(text,'3 tamamlanan sprintte','sprint sayısı');
 has(text,'%65','genel oran');
 for(const word of ['risk','öneri','performans','hedef','başarısız','sorumlu'])
  hasNot(text.toLowerCase(),word,'yargı içeren kelime');
});

test('locative suffix follows Turkish vowel harmony and digit endings',()=>{
 eq(locative('Sprint 11'),'Sprint 11’de','11');
 eq(locative('Sprint 16'),'Sprint 16’da','16');
 eq(locative('Sprint 3'),'Sprint 3’te','3');
 eq(locative('Sprint Bir'),'Sprint Bir’de','ünlü uyumu');
});

// ---------------------------------------------------------------- size distribution

test('size totals add up and shares are reported as rounded',()=>{
 eq(report.sizedTotal,40,'boyutlu iş');
 const map=new Map(report.sizeTotals.map(s=>[s.label,s]));
 eq(map.get('X-Small')!.count,1,'X-Small');
 eq(map.get('Small')!.count,6,'Small');
 eq(map.get('Medium')!.count,21,'Medium');
 eq(map.get('Large')!.count,11,'Large');
 eq(map.get('X-Large')!.count,1,'X-Large');
 eq(report.sizeTotals.reduce((n,s)=>n+s.count,0),report.sizedTotal,'toplam');
 for(const slice of report.sizeTotals)eq(slice.share,Math.round(slice.count*100/40),'pay '+slice.label);
});

test('an empty size category keeps its legend entry but no bar width',()=>{
 const noXl=buildDeliveryReport([rows[0]],SIZE_SETTINGS);
 const xl=noXl.sizeTotals.find(s=>s.label==='X-Large')!;
 eq(xl.count,0,'X-Large sayısı');eq(xl.share,0,'X-Large payı');
 eq(noXl.sizeTotals.length,5,'kategori korunur');
});

test('story point teams are not shown a size distribution',()=>{
 const points=buildDeliveryReport(rows,POINT_SETTINGS);
 eq(points.sizeMode,false,'size modu');
 eq(points.storyPoints,125,'toplam SP');
 eq(points.pointedTasks,37,'SP kayıtlı iş');
});

test('the size note is stated once and keeps size separate from hours',()=>{
 has(SIZE_NOTE,'Size saatten türetilmez','ölçüm notu');
 has(RATE_NOTE,'BAU hariç','oran tanımı');
});

// ---------------------------------------------------------------- figures

test('the trend chart keeps a fixed 0-100 scale and every sprint',()=>{
 const figure=trendFigure(report);
 ok(figure.marks.length>0,'işaret');
 for(const label of ['0','25','50','75','100'])
  ok(figure.marks.some(m=>m.kind==='text'&&m.text==='%'+label),'eksen değeri %'+label);
 for(const sprint of report.sprints)has(figure.desc,String(sprint.rate),'açıklamada '+sprint.name+' değeri');
});

test('the trend chart draws one stroked line, never a filled white path',()=>{
 const lines=trendFigure(report).marks.filter(m=>m.kind==='path');
 eq(lines.length,1,'çizgi sayısı');
 eq(lines[0].fill,'none','çizgi dolgusu');
 ok(lines[0].stroke&&lines[0].stroke!=='#fff','çizgi rengi görünür olmalı');
});

test('the trend chart has an accessible title and description',()=>{
 const figure=trendFigure(report);
 ok(figure.title.length>0,'başlık');
 ok(figure.desc.length>20,'açıklama');
});

test('an empty report produces an explained empty figure instead of an axis',()=>{
 for(const figure of [trendFigure(empty),intakeFigure(empty),sizeFigure(empty)])
  ok(figure.empty,'boş durum metni');
});

test('the intake chart states intake, delivered, difference and ratio as text',()=>{
 const figure=intakeFigure(report);
 const labels=figure.marks.filter(m=>m.kind==='text').map(m=>m.text??'').join(' | ');
 has(labels,'Alınan','alınan etiketi');
 has(labels,'Teslim','teslim etiketi');
 has(labels,'Fark','fark etiketi');
 has(figure.desc,'Sprint İki','açıklamada sprint adı');
});

test('the intake chart never reduces a sprint to an unexplained number pair',()=>{
 const text=intakeFigure(report).marks.filter(m=>m.kind==='text').map(m=>m.text??'').join(' ');
 hasNot(text,'10/10','açıklamasız sayı çifti');
});

test('a narrow size band keeps its share instead of losing the label',()=>{
 const lopsided=buildDeliveryReport([row({id:'n',number:1,name:'Sprint Bir',tasks:100,allTasks:100,done:100,undone:0,deliveryRate:100,
  sizeSmall:3,sizeMedium:90,sizeLarge:7,sizeXLarge:0})],SIZE_SETTINGS);
 const labels=sizeFigure(lopsided).marks.filter(m=>m.kind==='text').map(m=>m.text??'');
 for(const slice of lopsided.sizeTotals.filter(s=>s.count))
  ok(labels.some(l=>l.includes(percent(slice.share))),'dar bantta pay etiketi: '+slice.label);
});

test('the size figure describes each band with count and share',()=>{
 const figure=sizeFigure(report);
 has(figure.desc,'Medium','band adı');
 has(figure.desc,'%','pay');
 hasNot(figure.desc,SIZE_NOTE,'ölçüm notu grafikte tekrar etmemeli');
});

// ---------------------------------------------------------------- methodology

test('methodology covers every rule the report depends on',()=>{
 const terms=DELIVERY_METHODOLOGY.map(m=>m.term).join(' | ');
 for(const term of ['Teslimat oranı','BAU','Done','Undone','Aktif sprint','Size','Tarih','Yuvarlama'])
  has(terms,term,'tanım');
 for(const entry of DELIVERY_METHODOLOGY)ok(entry.text.trim().length>10,'tanım metni: '+entry.term);
});

// ---------------------------------------------------------------- standalone html

const html=deliveryReportHtml(rows,SIZE_SETTINGS,new Date('2026-03-01T08:35:00Z'),'Ödeme Ekibi');

test('the export carries the nine sections in order',()=>{
 const order=['Sprint Teslimatı','Teslimat Özeti','Öne Çıkan Bulgular','Teslimat Trendi',
  'Alınan İş ile Teslim Edilen İş','İşlerin Büyüklük Dağılımı','Sprint Karşılaştırması','Nasıl hesaplanıyor?'];
 let at=-1;
 for(const heading of order){
  const found=html.indexOf(heading);
  ok(found>at,'sıra bozuldu: '+heading);
  at=found;
 }
});

test('the export has exactly one h1',()=>{
 eq((html.match(/<h1[ >]/g)||[]).length,1,'h1 sayısı');
});

test('the measurement note is stated exactly once',()=>{
 eq(html.split(SIZE_NOTE).length-1,1,'ölçüm notu tekrarı');
});

test('chart values are never repeated as a visible caption under the figure',()=>{
 hasNot(html,'<figcaption','grafik altı tekrar');
 has(html,'<desc','ekran okuyucu metni');
});

test('the comparison table drops empty size chips but keeps them in the legend',()=>{
 eq(html.split('X-Large 0').length-1,0,'tabloda boş kategori');
 has(html,'X-Large ·','legend satırı');
});

test('the table declares a caption, column scopes and separate intake columns',()=>{
 has(html,'<caption>','başlık');
 has(html,'scope="col"','sütun kapsamı');
 for(const header of ['Alınan','BAU','BAU dahil','Done','Undone','Teslimat'])
  has(html,'>'+header+'</th>','sütun '+header);
 hasNot(html,'BAU dahil 13','birleşik hücre');
});

test('delivery ratio is not conveyed by colour alone',()=>{
 has(html,'%90','oran metni');
 has(html,'%50','oran metni');
});

test('a sprint without a ratio prints an em dash, not a zero',()=>{
 const blind=deliveryReportHtml([row({id:'z',number:4,name:'Sprint Dört',tasks:0,allTasks:2})],SIZE_SETTINGS,new Date());
 has(blind,'—','boş oran');
});

test('the generated time is Turkish, never a raw ISO stamp',()=>{
 has(html,'2026','yıl');
 hasNot(html,'2026-03-01T08:35','ISO damgası');
});

test('hostile sprint names are escaped in text and attributes',()=>{
 const risky=deliveryReportHtml([row({id:'h',number:5,name:HOSTILE,tasks:4,allTasks:4,done:2,undone:2,deliveryRate:50,
  sizeSmall:1,sizeMedium:3})],SIZE_SETTINGS,new Date(),HOSTILE,HOSTILE);
 hasNot(risky,'<script>alert','betik enjeksiyonu');
 hasNot(risky,'onerror=1>','öznitelik enjeksiyonu');
 has(risky,'&lt;script&gt;','kaçışlı metin');
 has(risky,'&quot;','kaçışlı tırnak');
});

test('long sprint names stay inside the document',()=>{
 has(html,'overflow-wrap:anywhere','taşma kuralı');
});

test('the export is self contained: no network, no script, no font',()=>{
 for(const forbidden of ['<script','http://','https://','@import','<canvas','cdn.','fonts.g','integrity='])
  hasNot(html,forbidden,'dış bağımlılık');
 has(html,"default-src 'none'",'içerik güvenlik politikası');
});

test('the export carries no secret-looking material',()=>{
 for(const forbidden of ['Bearer ','apiKey','api_key','password','xoxb-','PRIVATE KEY'])
  hasNot(html,forbidden,'sır');
});

test('the export is print ready for A4',()=>{
 has(html,'@page{size:A4','sayfa boyutu');
 has(html,'thead{display:table-header-group}','tekrar eden tablo başlığı');
 has(html,'break-after:avoid','başlık içerikle kalır');
 has(html,'prefers-reduced-motion','hareket tercihi');
});

test('charts are drawn as inline svg with a title and description',()=>{
 has(html,'<svg viewBox','gömülü svg');
 has(html,'role="img"','grafik rolü');
 has(html,'<desc','grafik açıklaması');
});

test('a team name is only printed when one is supplied',()=>{
 has(html,'Ödeme Ekibi','ekip adı');
 hasNot(deliveryReportHtml(rows,SIZE_SETTINGS,new Date()),'<dt>Ekip</dt>','ekip adı yokken boş satır');
});

console.log((failed?'  '+failed+' test başarısız':'  tüm testler geçti')+' ('+ran+' test)');
if(failed)process.exitCode=1;
