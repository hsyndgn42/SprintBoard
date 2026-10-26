/**
 * Screens show work that background jobs and other people change, so they poll
 * instead of waiting for the reader to reload the page by hand.
 *
 * A refresh is skipped while the tab is hidden, while any dialog is open, or
 * while the page reports it is busy, so an open form, an in-flight save or a
 * half-typed field is never replaced underneath the reader. Skipping costs
 * nothing: the next tick tries again once the page is idle.
 */
export class AutoRefresh {
  /** Long enough to stay invisible during typing, short enough that a Jira key
   *  or a teammate's status change shows up without being asked for. */
  static readonly PERIOD_MS = 30000;

  private timer: ReturnType<typeof setInterval> | null = null;

  start(run: () => unknown, busy: () => boolean = () => false, periodMs: number = AutoRefresh.PERIOD_MS): void {
    this.stop();
    this.timer = setInterval(() => {
      if (document.hidden || dialogOpen() || busy()) return;
      void run();
    }, periodMs);
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }
}

/**
 * Every dialog in the product renders inside `.modal-layer`, so asking the DOM
 * covers dialogs owned by child components too. Listing each page's dialog
 * flags by hand would silently miss the ones a page does not own.
 */
export function dialogOpen(): boolean {
  return !!document.querySelector('.modal-layer');
}
