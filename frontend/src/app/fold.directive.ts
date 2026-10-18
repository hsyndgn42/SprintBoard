import { Directive, ElementRef, HostListener, inject } from '@angular/core';

/** Native keyboard-accessible disclosure. Printing must include even collapsed content. */
@Directive({ selector: 'details[appFold]', standalone: true, host: { class: 'section-fold' } })
export class FoldDirective {
  private element = inject<ElementRef<HTMLDetailsElement>>(ElementRef);
  private screenOpen: boolean | null = null;
  @HostListener('window:beforeprint') beforePrint() {
    if (this.screenOpen !== null) return;
    this.screenOpen = this.element.nativeElement.open;
    this.element.nativeElement.open = true;
  }
  @HostListener('window:afterprint') afterPrint() {
    if (this.screenOpen === null) return;
    this.element.nativeElement.open = this.screenOpen;
    this.screenOpen = null;
  }
}
