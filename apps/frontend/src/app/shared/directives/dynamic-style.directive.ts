import {
  Directive,
  ElementRef,
  Input,
  Renderer2,
  OnChanges,
  SimpleChanges,
  inject,
} from "@angular/core";

export type CSSValue = string | number | null | undefined;

@Directive({
  selector: "[appDynamicStyle]",
  standalone: false,
})
export class DynamicStyleDirective implements OnChanges {
  private el = inject(ElementRef);
  private renderer = inject(Renderer2);

  @Input("appDynamicStyle") styles: Record<string, CSSValue> | null = null;

  private previousKeys: string[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if ("styles" in changes) {
      this.applyStyles();
    }
  }

  private applyStyles(): void {
    const native = this.el.nativeElement;

    // remove any styles that were previously set but are no longer present
    this.previousKeys.forEach((key) => {
      if (!this.styles || !(key in this.styles)) {
        this.renderer.removeStyle(native, key);
      }
    });

    this.previousKeys = [];

    if (this.styles) {
      Object.entries(this.styles).forEach(([key, value]) => {
        this.renderer.setStyle(native, key, value);
        this.previousKeys.push(key);
      });
    }
  }
}
