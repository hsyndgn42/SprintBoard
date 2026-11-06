/**
 * Regression cover for the "Acil İşler ve Kapsam Değişimi" report.
 *
 * The repository has no browser test runner, and the report model is deliberately free of Angular
 * imports so it can be checked here with nothing but the TypeScript compiler and Node. The data is
 * synthetic throughout: no real sprint number, work name or row count may leak into an assertion,
 * because those change every fortnight and a test that tracks them stops being a test.
 */
import type {Sprint,Task} from '../src/app/api.service';
import {
 EFFORT_NOTE,METHODOLOGY,TOTALS_NOTE,UNAVAILABLE_NOTE,
 buildScopeReport,coverageFigure,coverageSentence,movementFigure,summariseSprint,trackingOf,
 unavailableSentence,urgentFigure,waterfallFigure,
} from '../src/app/pages/scope-report.model';
import {scopeReportHtml} from '../src/app/pages/scope-report-html';

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
const LONG='Çok uzun bir iş başlığı: şğüöçİı '.repeat(12);

function task(id:string,hours:number,over:Partial<Task>={}):Task{
 return {id,sprintId:'',backlogId:'',name:'İş '+id,criteria:'',type:'',workKind:'',status:'todo',statusNote:'',
  estimatedHours:hours,remainingHours:0,storyPoints:null,size:null,externalId:'EXT-'+id,
  taskCategory:'DEV',taskSubtype:null,assignments:[],...over};
}
function event(action:'ADDED'|'REMOVED',at:string,reason:string,subject:Task){
 return {id:action+'-'+subject.id,action,at,reason,task:subject};
}
function sprint(over:Partial<Sprint>&{id:string;number:number;name:string}):Sprint{
 return {goal:'',start:'2026-01-05',end:'2026-01-16',status:'completed',storyPointsAvailable:false,
  taskCount:0,doneCount:0,undoneCount:0,deliveryTaskCount:0,deliveryDoneCount:0,deliveryUndoneCount:0,
  items:[],...over} as Sprint;
}

/** One fully tracked current sprint: three items, one urgent addition, identity balances exactly. */
const base3=[task('a',20),task('b',10)];
const urgent3=task('c',8,{emergency:true,status:'done',name:LONG});
const full=sprint({id:'s3',number:3,name:'Sprint Üç',status:'active',start:'2026-02-02',end:'2026-02-13',
 items:[...base3,urgent3],
 flow:{origin:'START',trackedAt:'2026-02-02T07:00:00Z',baseline:base3,
  events:[event('ADDED','2026-02-05T09:00:00Z',HOSTILE,urgent3)],
  version:1,wipLimit:null,wip:0,blocked:0,currentCount:3,added:1,removed:0}});

/** One partially tracked closed sprint: added and removed scope, and a drifting identity. */
const base2=[task('p',50)];
const openUrgent=task('q',12,{emergency:true,status:'todo'});
const movingUrgent=task('r',9,{emergency:true,status:'doing'});
const plain=task('t',5);
const returned=task('u',15,{status:'todo',replacementTaskName:'Yerine alınan acil iş'});
const partial=sprint({id:'s2',number:2,name:'Sprint İki',start:'2026-01-19',end:'2026-01-30',
 items:[...base2,openUrgent,movingUrgent,plain],
 flow:{origin:'OBSERVED',trackedAt:'2026-01-22T07:00:00Z',baseline:base2,
  events:[event('ADDED','2026-01-23T08:00:00Z','Üretim kaynaklı',openUrgent),
   event('ADDED','2026-01-24T08:00:00Z','',movingUrgent),
   event('ADDED','2026-01-26T08:00:00Z','Planlı olmayan analiz',plain),
   event('REMOVED','2026-01-27T08:00:00Z','Kapsam dışına alındı',returned)],
  version:1,wipLimit:null,wip:0,blocked:0,currentCount:4,added:3,removed:1}});

/** Sprints whose history was never recorded. They are not zeros. */
const blind=[1,0,-1].map(n=>sprint({id:'s'+n,number:n,name:'Sprint '+n,
 items:[task('z'+n,30)],
 flow:n===0?undefined:{origin:'UNTRACKED',trackedAt:null,baseline:[],events:[],
  version:1,wipLimit:null,wip:0,blocked:0,currentCount:1,added:0,removed:0}}));

const ALL=[...blind,partial,full];
const AT=new Date('2026-03-04T19:07:57.902Z');
const report=buildScopeReport(ALL,AT);
const html=scopeReportHtml(ALL,AT);

// ---------------------------------------------------------------- tracking states

test('tracking state follows the recorded origin, never the numbers',()=>{
 eq(trackingOf(full),'FULL','START kaydı tam takip');
 eq(trackingOf(partial),'PARTIAL','OBSERVED kaydı kısmi takip');
 eq(trackingOf(blind[0]),'UNAVAILABLE','UNTRACKED kaydı tarihçesiz');
 eq(trackingOf(blind[1]),'UNAVAILABLE','flow yokluğu tarihçesiz');
});

test('untracked sprints are counted apart and kept out of the totals',()=>{
 eq(report.totalSprints,5,'incelenen sprint');
 eq(report.fullCount,1,'tam takipli sprint');
 eq(report.partialCount,1,'kısmi takipli sprint');
 eq(report.unavailableCount,3,'tarihçesiz sprint');
 eq(report.tracked.length,2,'detaylandırılan sprint');
 eq(report.unavailableNames.length,3,'tarihçesiz sprint adı');
 ok(!report.tracked.some(s=>s.tracking==='UNAVAILABLE'),'tarihçesiz sprint takipliler arasına sızmamalı');
});

// ---------------------------------------------------------------- period summary

test('period totals add up the tracked sprints only',()=>{
 eq(report.addedItems,4,'eklenen iş');          // 1 + 3
 eq(report.addedHours,34,'eklenen efor');       // 8 + (12+9+5)
 eq(report.removedItems,1,'çıkarılan iş');
 eq(report.removedHours,15,'çıkarılan efor');
 eq(report.urgentCount,3,'acil iş');
 eq(report.urgentHours,29,'acil efor');         // 8 + 12 + 9
 eq(report.urgentDone,1,'tamamlanan acil iş');
 eq(report.urgentCompletion,33,'acil tamamlanma yüzdesi');
});

test('a period with no urgent work reports no completion ratio',()=>{
 const quiet=buildScopeReport([sprint({id:'q',number:9,name:'Sprint Dokuz',items:[task('x',4)],
  flow:{origin:'START',trackedAt:'2026-01-01T00:00:00Z',baseline:[task('x',4)],events:[],
   version:1,wipLimit:null,wip:0,blocked:0,currentCount:1,added:0,removed:0}})],AT);
 eq(quiet.urgentCount,0,'acil iş');
 eq(quiet.urgentCompletion,null,'oran üretilmemeli');
 ok(urgentFigure(quiet).empty,'acil iş yokken donut yerine boş durum');
 ok(!urgentFigure(quiet).marks.length,'boş durumda halka çizilmemeli');
});

test('a period with no sprint at all stays describable',()=>{
 const none=buildScopeReport([],AT);
 eq(none.tracked.length,0,'takipli sprint');
 has(coverageSentence(none),'Raporlanacak sprint yok','boş dönem cümlesi');
 ok(scopeReportHtml([],AT).length>500,'boş raporun HTML çıktısı yine de üretilmeli');
});

// ---------------------------------------------------------------- reconciliation

test('reconciliation difference is the gap between the identity and the current plan',()=>{
 const measured=summariseSprint(partial);
 eq(measured.baselineHours,50,'başlangıç');
 eq(measured.addedHours,26,'eklenen');
 eq(measured.removedHours,15,'çıkarılan');
 eq(measured.currentHours,76,'güncel');
 eq(measured.reconciliationHours,15,'mutabakat farkı');   // 76 - (50 + 26 - 15)
});

test('a balanced sprint reports an exact zero, not a rounding crumb',()=>{
 const measured=summariseSprint(full);
 eq(measured.reconciliationHours,0,'mutabakat farkı');
 const drawn=waterfallFigure(measured).marks.filter(m=>m.kind==='text'&&m.role==='label'&&m.text==='Mutabakat farkı');
 ok(!drawn.length,'sıfır fark için yanıltıcı sütun çizilmemeli');
});

// ---------------------------------------------------------------- ordering and detail

test('sprints are ordered newest first',()=>{
 eq(report.tracked.map(s=>s.number).join(','),'3,2','takipli sprint sırası');
 eq(report.unavailableNames.length,3,'tarihçesiz sprint sırası korunur');
});

test('returned work keeps its scope meaning and its replacement',()=>{
 const measured=summariseSprint(partial);
 eq(measured.returned.length,1,'geri dönen iş');
 eq(measured.returned[0].hours,15,'geri dönen işin planlanan eforu');
 eq(measured.returned[0].replacement,'Yerine alınan acil iş','yerine alınan acil iş');
 ok(measured.returned[0].previousStatus,'önceki durum boş bırakılmamalı');
});

test('urgent rows carry status, effort, date, type and the stored reason',()=>{
 const measured=summariseSprint(partial);
 eq(measured.urgent.length,2,'acil iş');
 eq(measured.urgent.map(r=>r.status).sort().join(','),'doing,todo','acil iş durumları');
 ok(measured.urgent.every(r=>r.at),'giriş tarihi');
 ok(measured.urgent.every(r=>r.category),'iş tipi');
 eq(measured.urgent.find(r=>r.id==='r')!.reason,'','kaydı olmayan gerekçe uydurulmamalı');
});

// ---------------------------------------------------------------- figures

test('the coverage figure labels every band with its count',()=>{
 const figure=coverageFigure(report);
 const text=figure.marks.filter(m=>m.kind==='text').map(m=>m.text).join(' ');
 has(text,'Tam takip','tam takip etiketi');
 has(text,'Tarihçe yok','tarihçesiz etiketi');
 has(figure.desc,'sıfır','tarihçesizin sıfır sayılmadığı açıklaması');
 ok(figure.title,'erişilebilir başlık');
});

test('the urgent figure states the completion share in its centre',()=>{
 const figure=urgentFigure(report);
 const text=figure.marks.filter(m=>m.kind==='text').map(m=>m.text).join(' ');
 has(text,'%33','tamamlanma yüzdesi');
 has(text,'1 / 3','tamamlanan / toplam');
 ok(figure.marks.some(m=>m.kind==='path'),'halka dilimleri');
});

test('the movement figure shows only tracked sprints, diverging from a zero line',()=>{
 const figure=movementFigure(report);
 const labels=figure.marks.filter(m=>m.kind==='text').map(m=>m.text||'');
 ok(labels.some(t=>t.includes('Sprint Üç')),'tam takipli sprint satırı');
 ok(labels.some(t=>t.includes('Sprint İki')),'kısmi takipli sprint satırı');
 ok(!labels.some(t=>t.includes('Sprint 1')),'tarihçesiz sprint sıfır satırı olarak eklenmemeli');
 ok(figure.marks.some(m=>m.kind==='line'&&m.role==='zero'),'sıfır çizgisi');
 ok(labels.some(t=>t.includes('kısmi')),'kısmi takip işaretlenmeli');
});

test('the waterfall runs baseline, added, removed, difference, current',()=>{
 const figure=waterfallFigure(summariseSprint(partial));
 const bars=figure.marks.filter(m=>m.kind==='text'&&m.role==='label').map(m=>m.text);
 eq(bars.join(' > '),'Takip başlangıcı > Eklenen > Çıkarılan > Mutabakat farkı > Güncel plan','şelale sırası');
 const text=figure.marks.filter(m=>m.kind==='text').map(m=>m.text).join(' ');
 has(text,'+26','eklenen saat etiketi');
 has(text,'−15','çıkarılan saat etiketi');
});

test('every figure is readable without hover',()=>{
 for(const figure of [coverageFigure(report),urgentFigure(report),movementFigure(report),waterfallFigure(report.tracked[0])]){
  ok(figure.title.length>3,figure.id+' başlığı');
  ok(figure.desc.length>10,figure.id+' metinsel özeti');
  ok(figure.width>0&&figure.height>0,figure.id+' ölçüsü');
 }
});

// ---------------------------------------------------------------- standalone html

test('the standalone report keeps one title and one methodology',()=>{
 eq(html.split('<h1').length-1,1,'h1 sayısı');
 eq(html.split('Acil İşler ve Kapsam Değişimi</h1>').length-1,1,'rapor başlığı tekrar etmemeli');
 eq(html.split('Hesaplama Yöntemi').length-1,1,'yöntem bölümü tekrar etmemeli');
 for(const term of METHODOLOGY)has(html,term.term,'yöntem tanımı: '+term.term);
});

test('untracked sprints appear once as a summary, never as repeated cards',()=>{
 eq(html.split('Bu sprint için kapsam değişimi takibi yok').length-1,0,'eski tekrarlı kart metni');
 has(html,UNAVAILABLE_NOTE,'tarihçesiz uyarısı');
 has(html,unavailableSentence(report),'tarihçesiz özeti');
 eq(html.split(UNAVAILABLE_NOTE).length-1>=1?1:0,1,'uyarı en az bir kez yazılmalı');
 for(const name of report.unavailableNames)eq(html.split('>'+name+'<').length-1,0,name+' için ayrı detay bölümü açılmamalı');
});

test('tracked sprints get a detail section each',()=>{
 has(html,'Sprint Üç','tam takipli sprint detayı');
 has(html,'Sprint İki','kısmi takipli sprint detayı');
 ok(html.split(EFFORT_NOTE).length-1>=report.tracked.length,'efor notu her takipli sprintte');
 has(html,TOTALS_NOTE,'dönem toplamı kapsamı notu');
});

test('the comparison table is announced and headed properly',()=>{
 has(html,'<caption','tablo başlığı');
 has(html,'scope="col"','sütun kapsamı');
 has(html,'Mutabakat farkı','mutabakat sütunu');
 has(html,'Kısmi tarihçe','kısmi takip etiketi');
});

test('the header shows a Turkish timestamp and keeps ISO out of sight',()=>{
 has(html,'2026','tarih');
 hasNot(html.split('<footer')[0],AT.toISOString(),'görünür başlıkta ham ISO damgası');
 has(html,AT.toISOString(),'teknik damga üstverisinde kalmalı');
 has(html,'Planlanan efor','efor türü');
});

test('approval text is never presented as a business reason',()=>{
 hasNot(html,'Geliş gerekçesi','yanıltıcı gerekçe etiketi');
 has(html,'Gerekçe kaydı','muhafazakâr gerekçe etiketi');
});

test('removed work reads as out of scope rather than undone',()=>{
 has(html,'Kapsamdan çıkarıldı','kapsam durumu');
 has(html,'Undone olarak değerlendirilmez','tamamlanma durumu');
});

// ---------------------------------------------------------------- safety

test('hostile reason text is escaped in both text and attributes',()=>{
 hasNot(html,'<script>','çalıştırılabilir etiket');
 hasNot(html,'<img','kaçırılmamış görsel etiketi');
 hasNot(html,'onerror="','olay işleyici özniteliği');
 has(html,'&lt;script&gt;','kaçırılmış etiket');
 has(html,'&quot;','kaçırılmış tırnak');
 has(html,'&#39;','kaçırılmış tek tırnak');
 const attributes=html.match(/aria-label="[^"]*"/g)||[];
 ok(attributes.every(a=>!a.includes('<')),'öznitelik içinde ham etiket');
});

test('the standalone file needs no network, no font and no script',()=>{
 hasNot(html,'<script','betik');
 hasNot(html,'http://','dış http adresi');
 hasNot(html,'https://','dış https adresi');
 hasNot(html,'@import','dış stil');
 hasNot(html,'<canvas','erişilemez tuval');
 has(html,'Content-Security-Policy','içerik güvenliği başlığı');
 has(html,'<svg','gömülü grafik');
});

test('Turkish characters, long titles and newlines survive',()=>{
 has(html,'şğüöçİı','Türkçe karakterler');
 has(html,'Sprint İki','Türkçe sprint adı');
 const wrapped=scopeReportHtml([sprint({id:'n',number:4,name:'Sprint Dört',items:[task('n1',3)],
  flow:{origin:'START',trackedAt:'2026-01-01T00:00:00Z',baseline:[task('n1',3)],
   events:[event('ADDED','2026-01-02T00:00:00Z','Birinci satır\nİkinci satır',task('n2',1,{emergency:true}))],
   version:1,wipLimit:null,wip:0,blocked:0,currentCount:1,added:1,removed:0}})],AT);
 has(wrapped,'İkinci satır','satır sonu korunmalı');
 hasNot(wrapped,'Birinci satır\r','satır sonu bozulmamalı');
});

test('print rules target A4 and keep sections whole',()=>{
 has(html,'@media print','yazdırma kuralı');
 has(html,'@page','sayfa kuralı');
 has(html,'A4','A4 ölçüsü');
 has(html,'break-inside:avoid','bölüm bütünlüğü');
 has(html,'display:table-header-group','tablo başlığı tekrarı');
 has(html,'prefers-reduced-motion','azaltılmış hareket');
});

console.log((failed?'  ':'  ')+(ran-failed)+'/'+ran+' kontrol geçti');
if(failed)process.exitCode=1;
