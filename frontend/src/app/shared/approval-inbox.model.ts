/** Pure logic for the approval bell, kept separate from the component so the
 *  counting and labelling rules can be tested without a browser. */

export interface ApprovalQueue { key: string; label: string; route: string; count: number; }
export interface ApprovalSummary { total?: number; queues?: ApprovalQueue[]; checkedAt?: string; }

export const EMPTY_SUMMARY: ApprovalSummary = { total: 0, queues: [] };
/** Poll slowly: a missed approval costs minutes, not seconds, and the request
 *  runs for every administrator with the application open. */
export const REFRESH_MS = 60_000;
/** Larger counts stop fitting the badge; the panel still shows the exact number. */
export const BADGE_MAX = 9;

/** Derived from the queues rather than the reported total, so a badge can
 *  never disagree with the list shown underneath it. */
export function summaryTotal(summary: ApprovalSummary): number {
  return (summary.queues || []).reduce((sum, queue) => sum + (queue.count > 0 ? queue.count : 0), 0);
}

/** Only queues that need a decision are listed; an empty queue is not news. */
export function pendingQueues(summary: ApprovalSummary): ApprovalQueue[] {
  return (summary.queues || [])
    .filter(queue => queue.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'tr'));
}

export function badgeText(total: number): string {
  return total > BADGE_MAX ? `${BADGE_MAX}+` : String(total);
}

/** Unknown must not read as zero: a failed poll says so instead of claiming
 *  the queues are clear. */
export function bellLabel(summary: ApprovalSummary, failed: boolean): string {
  if (failed) return 'Onay bekleyenler okunamadı. Listeyi açıp yeniden deneyin.';
  const total = summaryTotal(summary);
  return total
    ? `Onay bekleyen ${total} kayıt var. Listeyi aç.`
    : 'Onay bekleyen kayıt yok. Listeyi aç.';
}
