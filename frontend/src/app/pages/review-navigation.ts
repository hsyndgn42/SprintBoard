/** In-page navigation must never replace the application's hash route. */
export function revealReviewSection(root: HTMLElement, id: string): void {
  if (!/^review-[a-z-]+$/.test(id)) return;
  const target = root.querySelector<HTMLElement>('#' + id);
  if (!target) return;
  const disclosure = target.matches('details') ? target : target.querySelector('details');
  if (disclosure) disclosure.setAttribute('open', '');
  const focus = target.querySelector<HTMLElement>('summary, h2') || target;
  focus.setAttribute('tabindex', '-1');
  focus.focus({ preventScroll: true });
  target.scrollIntoView({ behavior: 'auto', block: 'start' });
}
