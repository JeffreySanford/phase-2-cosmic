import { DOCUMENT } from "@angular/common";
import { Injectable, inject } from "@angular/core";

type WindowWithCustomEvent = Window & {
  CustomEvent: new (
    type: string,
    eventInitDict?: CustomEventInit<unknown>
  ) => CustomEvent<unknown>;
};

type WindowWithEventCtor = Window & {
  Event: new (type: string, eventInitDict?: EventInit) => Event;
};

type WindowWithWebSocket = Window & {
  WebSocket?: typeof WebSocket;
};

@Injectable({ providedIn: "root" })
export class BrowserPlatformService {
  private readonly document = inject(DOCUMENT, { optional: true });

  get window(): WindowWithWebSocket | null {
    return this.document?.defaultView ?? null;
  }

  readCssVar(name: string, fallback = ""): string {
    const browserWindow = this.window;
    const document = this.document;
    if (!browserWindow || !document?.documentElement) return fallback;
    try {
      const value = browserWindow
        .getComputedStyle(document.documentElement)
        .getPropertyValue(name);
      return (value || fallback).trim();
    } catch {
      return fallback;
    }
  }

  dispatchWindowEvent(
    type: string,
    detail?: Record<string, unknown> | boolean | string | number | null
  ): void {
    const browserWindow = this.window;
    if (!browserWindow) return;
    try {
      if (
        detail !== undefined &&
        typeof (browserWindow as Partial<WindowWithCustomEvent>).CustomEvent ===
          "function"
      ) {
        const customEventWindow = browserWindow as WindowWithCustomEvent;
        browserWindow.dispatchEvent(
          new customEventWindow.CustomEvent(type, { detail })
        );
        return;
      }
      const eventWindow = browserWindow as WindowWithEventCtor;
      browserWindow.dispatchEvent(new eventWindow.Event(type));
    } catch {
      // ignore
    }
  }

  getStorageItem(key: string): string | null {
    try {
      return this.window?.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  setStorageItem(key: string, value: string): void {
    try {
      this.window?.localStorage?.setItem(key, value);
    } catch {
      // ignore
    }
  }

  removeStorageItem(key: string): void {
    try {
      this.window?.localStorage?.removeItem(key);
    } catch {
      // ignore
    }
  }

  downloadBlob(blob: Blob, filename: string): void {
    const document = this.document;
    if (!document) return;
    const url = URL.createObjectURL(blob);
    try {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body?.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  requestFullscreen(container: HTMLElement | null): void {
    if (!container) return;
    try {
      container.requestFullscreen?.();
    } catch {
      // ignore
    }
  }

  exitFullscreen(): void {
    try {
      this.document?.exitFullscreen?.();
    } catch {
      // ignore
    }
  }

  createElementNS(namespaceURI: string, qualifiedName: string): Element | null {
    const document = this.document;
    if (!document) return null;
    try {
      return document.createElementNS(namespaceURI, qualifiedName);
    } catch {
      return null;
    }
  }

  querySelector<T extends Element>(
    root: Element | null,
    selector: string
  ): T | null {
    if (!root) return null;
    try {
      return root.querySelector(selector) as T | null;
    } catch {
      return null;
    }
  }

  querySelectorAll<T extends Element>(
    root: Element | null,
    selector: string
  ): T[] {
    if (!root) return [];
    try {
      return Array.from(root.querySelectorAll(selector)) as T[];
    } catch {
      return [];
    }
  }
}
