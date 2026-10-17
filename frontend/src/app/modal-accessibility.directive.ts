import { AfterViewInit, Directive, ElementRef, HostListener, OnDestroy, inject } from '@angular/core';

/** Shared keyboard/assistive-technology behavior for the existing modal frames. */
@Directive({selector:'.modal-layer',standalone:true})
export class ModalAccessibilityDirective implements AfterViewInit, OnDestroy {
  private static stack:ModalAccessibilityDirective[]=[];
  private static background=new Map<HTMLElement,boolean>();
  private static overflow='';
  private static sequence=0;
  private host=inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private opener=document.activeElement instanceof HTMLElement?document.activeElement:null;
  private frame!:HTMLElement;
  private get top(){return ModalAccessibilityDirective.stack.at(-1)===this;}
  ngAfterViewInit(){
    this.frame=this.host.querySelector<HTMLElement>('.modal')!;
    this.frame.setAttribute('role','dialog');this.frame.setAttribute('aria-modal','true');this.frame.tabIndex=-1;
    // Chrome can tab into a read-only scroll region without an explicit tabindex.
    // Include that region in our focus boundaries so Shift+Tab cannot escape it.
    for(const body of Array.from(this.frame.querySelectorAll<HTMLElement>('.modal-body'))){
      if(!body.hasAttribute('tabindex')&&!body.querySelector('button,a[href],input,select,textarea,[tabindex]'))body.tabIndex=0;
    }
    if(!this.frame.hasAttribute('aria-labelledby')){
      const title=this.frame.querySelector<HTMLElement>('h2');
      if(title){title.id ||= 'modal-title-'+(++ModalAccessibilityDirective.sequence);this.frame.setAttribute('aria-labelledby',title.id);}
    }
    if(!ModalAccessibilityDirective.stack.length)ModalAccessibilityDirective.overflow=document.body.style.overflow;
    ModalAccessibilityDirective.stack.push(this);ModalAccessibilityDirective.updateBackground();
    queueMicrotask(()=>{if(this.top)this.focusFirst();});
  }
  private static updateBackground(){
    for(const [element,inert] of this.background)element.inert=inert;
    this.background.clear();
    const top=this.stack.at(-1);
    document.body.style.overflow=top?'hidden':this.overflow;
    if(!top)return;
    for(let branch:HTMLElement|null=top.host;branch?.parentElement;branch=branch.parentElement){
      for(const sibling of Array.from(branch.parentElement.children)){
        if(sibling instanceof HTMLElement&&sibling!==branch){this.background.set(sibling,sibling.inert);sibling.inert=true;}
      }
      if(branch.parentElement===document.body)break;
    }
  }
  private controls(){return Array.from(this.frame.querySelectorAll<HTMLElement>('button,a[href],input,select,textarea,[tabindex]')).filter(e=>e.tabIndex>=0&&!e.matches(':disabled')&&!e.closest('[inert]')&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden');}
  private focusFirst(){(this.controls()[0]||this.frame).focus({preventScroll:true});}
  @HostListener('document:keydown',['$event']) key(event:KeyboardEvent){
    if(!this.top||document.querySelector('dialog[open]'))return;
    if(event.key==='Escape'){
      event.preventDefault();event.stopPropagation();
      this.frame.querySelector<HTMLButtonElement>('[data-modal-dismiss]:not(:disabled)')?.click();
    }else if(event.key==='Tab'){
      const controls=this.controls(),first=controls[0],last=controls.at(-1);
      if(!first){event.preventDefault();this.frame.focus();return;}
      if(!this.frame.contains(document.activeElement)||event.shiftKey&&document.activeElement===first||!event.shiftKey&&document.activeElement===last){event.preventDefault();(event.shiftKey?last:first)?.focus();}
    }
  }
  @HostListener('document:focusin',['$event']) focus(event:FocusEvent){
    if(this.top&&!document.querySelector('dialog[open]')&&!this.frame.contains(event.target as Node))this.focusFirst();
  }
  ngOnDestroy(){
    const wasTop=this.top;
    ModalAccessibilityDirective.stack=ModalAccessibilityDirective.stack.filter(d=>d!==this);
    ModalAccessibilityDirective.updateBackground();
    if(wasTop)queueMicrotask(()=>{
      if(this.opener?.isConnected&&!this.opener.closest('[inert]'))this.opener.focus({preventScroll:true});
      else if(ModalAccessibilityDirective.stack.length)ModalAccessibilityDirective.stack.at(-1)?.focusFirst();
    });
  }
}
