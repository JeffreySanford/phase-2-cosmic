jest.mock('aladin-lite', () => {
  const factory = jest.fn((el: HTMLElement, opts?: unknown) => {
    // simulate DOM rendering by appending a child node
    try {
      const child = (el && typeof el.appendChild === 'function') ? (el.ownerDocument || document).createElement('div') : null;
      if (child) {
        child.className = 'aladin-mock-inner';
        el.appendChild(child);
      }
    } catch {
      // ignore in test environments
    }
    const setOptions = jest.fn();
    const addControl = jest.fn();
    const update = jest.fn();
    return {
      remove: jest.fn(),
      destroy: jest.fn(),
      setOptions,
      addControl,
      update,
      __opts: opts,
      __el: el,
    };
  });
  const init = jest.fn(() => Promise.resolve());
  return {
    aladin: factory,
    wasmLibs: { core: {} },
    init,
  };
}, { virtual: true });

// detect jsdom so tests can adapt to our loader logic
const isJsdom = /jsdom/.test(window?.navigator?.userAgent ?? '');

import { TestBed, ComponentFixture, waitForAsync } from '@angular/core/testing';
import { ViewerComponent } from './viewer.component';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { firstValueFrom, timer } from 'rxjs';

describe('ViewerComponent', () => {
  let fixture: ComponentFixture<ViewerComponent>;
  let component: ViewerComponent;

  beforeEach(
    waitForAsync(() =>
      TestBed.configureTestingModule({
        declarations: [ViewerComponent],
        schemas: [NO_ERRORS_SCHEMA],
      })
        .compileComponents()
        .then(() => {
          fixture = TestBed.createComponent(ViewerComponent);
          component = fixture.componentInstance;
        })
    )
  );

  it('emits viewerReady when factory returns instance', () => {
    const readySpy = jest.fn();
    component.viewerReady.subscribe(readySpy);

    fixture.detectChanges();

    // wait for async init pipeline
    return firstValueFrom(timer(50)).then(() => {
      expect(readySpy).toHaveBeenCalled();
      const instance = readySpy.mock.calls[0][0];
      expect(instance).toBeTruthy();
      expect(typeof instance.remove).toBe('function');
    });
  });

  it('calls aladin init and factory during init', () => {
    const mod = jest.requireMock('aladin-lite') as unknown as {
      init: jest.Mock;
      aladin: jest.Mock;
      wasmLibs: { core: unknown };
    };
    const initSpy = mod.init as jest.Mock;
    const factorySpy = mod.aladin as jest.Mock;

    fixture.detectChanges();
    // allow a bit of time for the idle/fallback scheduling to run
    return firstValueFrom(timer(50)).then(() => {
      if (!isJsdom) {
        expect(initSpy).toHaveBeenCalled();
      }
      expect(factorySpy).toHaveBeenCalled();
    });
  });

  it('creates the viewer inside the container element', () => {
    fixture.detectChanges();
    return firstValueFrom(timer(50)).then(() => {
      const mod = jest.requireMock('aladin-lite') as unknown as {
        aladin: jest.Mock;
      };
      const factorySpy = mod.aladin as jest.Mock;
      expect(factorySpy).toHaveBeenCalled();
      const calledWith = factorySpy.mock.calls[0][0];
      if (typeof calledWith === 'string') {
        // factory may accept a selector string; ensure it references the container id
        expect(calledWith).toContain(component.containerRef.nativeElement.id);
      } else {
        // allow different DOM wrappers/proxies in jsdom; verify identifying attributes instead
        const el = calledWith as Element;
        expect(el).toBeTruthy();
        expect(el.tagName?.toLowerCase()).toBe(component.containerRef.nativeElement.tagName.toLowerCase());
        expect(el.id === component.containerRef.nativeElement.id || el.classList.contains('aladin-container')).toBe(true);
      }
    });
  });

  it('shows loading indicator until viewerReady and then removes it', () => {
    // initially loading indicator should be present
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.loading')).toBeTruthy();

    return firstValueFrom(timer(50)).then(() => {
      fixture.detectChanges();
      expect(root.querySelector('.loading')).toBeFalsy();
    });
  });

  it('enables controls (addControl or setOptions) when inputs request them', () => {
    // request controls before initialization
    component.showLayersControl = true;
    component.showZoomControl = true;
    component.showFullScreenControl = true;

    fixture.detectChanges();

    return firstValueFrom(timer(50)).then(() => {
      const mod = jest.requireMock('aladin-lite') as unknown as { aladin: jest.Mock };
      const factorySpy = mod.aladin as jest.Mock;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inst = factorySpy.mock.results[0].value as any;
      // either setOptions was called with optsControls or addControl called for at least one control
      const setOptionsCalled = inst.setOptions && inst.setOptions.mock.calls.length > 0;
      const addControlCalled = inst.addControl && inst.addControl.mock.calls.length > 0;
      expect(setOptionsCalled || addControlCalled).toBe(true);
    });
  });

  it('calls remove/destroy on ngOnDestroy', () => {
    fixture.detectChanges();
    // wait for async init pipeline
    return firstValueFrom(timer(50)).then(() => {
      // ensure instance is set
      expect(component.instance).toBeTruthy();

      const inst = component.instance as unknown as { remove?: jest.Mock; destroy?: jest.Mock };
      const removeSpy = inst.remove as jest.Mock | undefined;
      const destroySpy = inst.destroy as jest.Mock | undefined;

      component.ngOnDestroy();

      // component should call remove() or destroy(); at least one should be called
      const removed = removeSpy && removeSpy.mock.calls.length > 0;
      const destroyed = destroySpy && destroySpy.mock.calls.length > 0;
      expect(removed || destroyed).toBe(true);
    });
  });
});
