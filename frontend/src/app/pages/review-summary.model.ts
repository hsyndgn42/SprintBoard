import type { ProductSettings, Sprint, Task } from '../api.service';
import { buildReview, effort, isLeave, percent } from './review.model';
import { buildScope } from './scope-summary.model';
import type { ReviewOperations } from './review-operations.model';

/**
 * Derived review read-model.
 *
 * Everything here is computed from data the existing endpoints already
 * return. It defines no new business rule, changes no status meaning and
 * never persists anything. It lives in its own file because
 * scope-summary.model already imports from review.model, so combining the
 * two would create an import cycle.
 */

/** Shown when a value is genuinely unknown. Deliberately not "0". */
export const UNKNOWN = '—';

export interface SummaryMetric {
  key: string;
  label: string;
  display: string;
  /** Formula, unit and scope, so a number is never shown without its meaning. */
  detail: string;
  /** false => the underlying data is unavailable, which is not the same as zero. */
  known: boolean;
}

export interface ReviewException {
  key: string;
  label: string;
  count: number;
  /** Factual description of the condition. Never a cause or a judgement. */
  detail: string;
  names: string[];
}

const nf = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 });
const num = (value: number) => nf.format(Number.isFinite(value) ? value : 0);
const names = (tasks: Task[]) => tasks.map(task => task.name);

export const isBlocked = (task: Task) => task.blocker?.blocked === true;
export const isProdDefect = (task: Task) => task.taskCategory === 'DEFECT' && task.taskSubtype === 'PROD_DEFECT';
export const isUnassigned = (task: Task) => task.assignments.length === 0;

/**
 * Executive summary.
 *
 * Rate uses a guarded denominator: with no delivery work the rate is
 * unknown, not 0%. Scope metrics are unknown when the sprint has no flow
 * tracking, because "no recorded change" and "changes were never tracked"
 * are different statements and must not look the same.
 *
 * There is deliberately no combined health score and no red/green verdict.
 */
export function reviewSummary(
  sprint: Sprint,
  settings: ProductSettings,
  operations?: ReviewOperations,
): SummaryMetric[] {
  const review = buildReview(sprint, settings);
  const scope = buildScope(sprint);
  const delivery = review.delivery;
  const sized = settings.estimationMode === 'SIZE_AND_HOURS';
  const unestimated = sized ? review.missingSize : review.missingPoints;
  const metric = (
    key: string, label: string, display: string, detail: string, known = true,
  ): SummaryMetric => ({ key, label, display: known ? display : UNKNOWN, detail, known });

  const metrics: SummaryMetric[] = [
    metric('delivery', 'Teslimat işi', `${delivery.length}`,
      'BAU ve izin kayıtları hariç sprint işleri. Teslimat oranının paydasıdır.'),
    metric('done', 'Done', `${review.done}`,
      'Durumu Done olan teslimat işi adedi. Sprint kapsamı.'),
    metric('rate', 'Done oranı', review.rate === null ? UNKNOWN : `${review.rate}%`,
      'Done teslimat işi / toplam teslimat işi. Teslimat işi yoksa hesaplanmaz; sıfırla eş tutulmaz.',
      review.rate !== null),
    metric('pending', 'Tamamlanmayan', `${review.pending.length}`,
      'Done olmayan teslimat işleri: Undone, devam eden ve yapılacak.'),
    metric('deliveryHours', 'Planlanan teslimat eforu', `${num(review.deliveryHours)} sa`,
      'Teslimat işlerindeki planlanan saat toplamı. Gerçekleşen süre değildir.'),
    metric('bauHours', 'Planlanan BAU eforu', `${num(review.bauHours)} sa`,
      'BAU kayıtlarındaki planlanan saat toplamı. Teslimat oranına girmez.'),
    metric('added', 'Kapsama eklenen', `+${scope.added.length}`,
      'Takip başlangıcından sonra sprinte eklenen işler. Kapsam takibi yoksa bilinmez.',
      scope.tracked),
    metric('removed', 'Kapsamdan çıkan', `−${scope.removed.length}`,
      'Takip başlangıcından sonra backlog’a döndürülen işler. Undone ile aynı şey değildir.',
      scope.tracked),
    metric('emergency', 'Acil / plansız', `${scope.emergencies.length}`,
      'Acil olarak işaretlenip sprint sürerken alınan işler.',
      scope.tracked),
    metric('blocked', 'Blokajlı', `${sprint.items.filter(isBlocked).length}`,
      'Blokaj işareti açık olan işler. İşaret kullanıcı tarafından konur.'),
    metric('unassigned', 'Atanmamış teslimat', `${delivery.filter(isUnassigned).length}`,
      'Hiç ataması olmayan teslimat işleri.'),
    metric('unestimated', 'Tahminsiz teslimat', `${unestimated}`,
      sized
        ? 'Size belirtilmemiş teslimat işleri. Eksik tahmin sıfır sayılmaz.'
        : 'Story Point belirtilmemiş teslimat işleri. Eksik tahmin sıfır sayılmaz.'),
    metric('prodDefect', 'Prod defect', `${sprint.items.filter(isProdDefect).length}`,
      'Alt türü Prod Defect olan kayıtlar. Kalite göstergesi olarak yorumlanmaz.'),
  ];

  // Overtime is only meaningful when the operations payload has loaded.
  // Omitting it is better than printing 0 sa for data we do not have yet.
  if (operations) {
    metrics.push(metric('overtime', 'Kayıtlı mesai', `${num(operations.earned)} sa`,
      'Bu sprint için kayıtlı toplam mesai. Planlanan efora eklenmez.'));
  }
  return metrics;
}

/**
 * Risks and exceptions.
 *
 * Each entry is a recorded condition, not an interpretation. No cause,
 * no responsible person, no performance conclusion and no suggested
 * action is produced here; doing so would be inventing content the user
 * never entered.
 */
export function reviewExceptions(
  sprint: Sprint,
  settings: ProductSettings,
  operations?: ReviewOperations,
): ReviewException[] {
  const review = buildReview(sprint, settings);
  const scope = buildScope(sprint);
  const delivery = review.delivery;
  const sized = settings.estimationMode === 'SIZE_AND_HOURS';
  const out: ReviewException[] = [];
  const add = (key: string, label: string, detail: string, tasks: Task[], count = tasks.length) => {
    if (count > 0) out.push({ key, label, count, detail, names: names(tasks) });
  };

  add('blocked', 'Blokajlı iş',
    'Blokaj işareti açık. Gerekçe metni işin kendi kaydındadır.',
    sprint.items.filter(isBlocked));
  add('unassigned', 'Atanmamış teslimat işi',
    'Teslimat işi hiç kimseye atanmamış.',
    delivery.filter(isUnassigned));
  add('unestimated', 'Tahminsiz teslimat işi',
    sized ? 'Size belirtilmemiş.' : 'Story Point belirtilmemiş.',
    delivery.filter(task => sized
      ? !['SMALL', 'MEDIUM', 'LARGE', 'X-LARGE'].includes(task.size || '')
      : task.storyPoints == null));
  add('undoneWithoutNote', 'Gerekçesiz Undone',
    'Undone işaretli ancak sonuç/gerekçe notu girilmemiş.',
    delivery.filter(task => task.status === 'undone' && !task.statusNote));
  add('prodDefect', 'Prod defect kaydı',
    'Alt türü Prod Defect olan kayıtlar.',
    sprint.items.filter(isProdDefect));

  if (scope.tracked) {
    add('emergency', 'Acil / plansız alınan iş',
      'Sprint sürerken acil işaretiyle alınmış. Geliş gerekçeleri kapsam bölümündedir.',
      scope.emergencies.map(entry => entry.task));
    add('added', 'Sprint içinde eklenen iş',
      'Takip başlangıcından sonra kapsama girmiş.',
      scope.added.map(entry => entry.task));
    add('removed', 'Backlog’a döndürülen iş',
      'Kapsamdan çıkarılmış; Undone ile aynı şey değildir.',
      scope.removed.map(entry => entry.task));
  } else {
    out.push({
      key: 'untracked', count: 0, label: 'Kapsam değişimi takip edilmiyor',
      detail: 'Bu sprint için başlangıç kapsamı kaydı yok. Değişim olmadığı anlamına gelmez.',
      names: [],
    });
  }

  if (operations && operations.earned > 0) {
    out.push({
      key: 'overtime', count: 1, label: 'Kayıtlı mesai var',
      detail: `Bu sprint için ${num(operations.earned)} saat mesai kaydı bulunuyor.`,
      names: [],
    });
  }
  return out;
}

/**
 * Metric definitions, shared by the screen and every generated export so
 * the same word cannot mean two things in two places.
 */
export const REVIEW_DEFINITIONS: [string, string][] = [
  ['Teslimat işi', 'BAU ve izin kayıtları dışındaki sprint işleri. Teslimat oranının paydasıdır.'],
  ['Teslimat oranı', 'Done teslimat işi / toplam teslimat işi. Teslimat işi yoksa oran hesaplanmaz ve — gösterilir; sıfır teslimatla eş tutulmaz.'],
  ['BAU', 'Ekip operasyonu. Her zaman Done kabul edilir ve teslimat oranına girmez.'],
  ['Planlanan efor', 'Atamalardaki saat toplamı. Gerçekleşen süre veya performans ölçüsü değildir.'],
  ['Göreli tahmin', 'Size veya Story Point. İşin büyüklüğünü anlatır; saatten türetilmez.'],
  ['Kapsam değişimi', 'Sprint takip başlangıcından sonra eklenen veya çıkarılan işler. Takip yoksa bilinmez.'],
  ['Acil / plansız iş', 'Sprint sürerken acil işaretiyle alınan işler.'],
  ['Blokaj', 'Kullanıcının blokaj işareti koyduğu işler. Otomatik tespit edilmez.'],
  ['İstisna', 'Kayıtlı veriden türetilen olgular. Sebep, sorumlu veya performans yorumu içermez.'],
];

export const reviewPercent = percent;
export const reviewEffort = effort;
export const reviewIsLeave = isLeave;
