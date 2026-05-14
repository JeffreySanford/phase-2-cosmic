import { TestBed } from "@angular/core/testing";
import { BrowserPlatformService } from "./browser-platform.service";

describe("BrowserPlatformService", () => {
  afterEach(() => {
    document.documentElement.style.removeProperty("--accent");
    document.body.innerHTML = "";
    jest.restoreAllMocks();
  });

  it("interacts with browser APIs when a document is available", () => {
    TestBed.configureTestingModule({});
    const service = TestBed.inject(BrowserPlatformService);

    document.documentElement.style.setProperty("--accent", " #123456 ");
    expect(service.readCssVar("--accent", "fallback")).toBe("#123456");

    const detailListener = jest.fn();
    const plainListener = jest.fn();
    window.addEventListener("platform-custom", detailListener as EventListener);
    window.addEventListener("platform-plain", plainListener as EventListener);

    service.dispatchWindowEvent("platform-custom", { ready: true });
    service.dispatchWindowEvent("platform-plain");

    expect(detailListener).toHaveBeenCalledTimes(1);
    expect(
      (detailListener.mock.calls[0][0] as CustomEvent<{ ready: boolean }>).detail
    ).toEqual({ ready: true });
    expect(plainListener).toHaveBeenCalledTimes(1);

    service.setStorageItem("platform-key", "value");
    expect(service.getStorageItem("platform-key")).toBe("value");
    service.removeStorageItem("platform-key");
    expect(service.getStorageItem("platform-key")).toBeNull();

    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    const createObjectUrl = jest.fn(() => "blob:platform");
    const revokeObjectUrl = jest.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrl,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrl,
    });
    const clickSpy = jest
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    service.downloadBlob(new Blob(["payload"]), "payload.txt");

    expect(createObjectUrl).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:platform");
    expect(document.querySelector('a[download="payload.txt"]')).toBeNull();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: originalCreateObjectUrl,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: originalRevokeObjectUrl,
    });

    const fullscreenElement = {
      requestFullscreen: jest.fn(),
    } as unknown as HTMLElement;
    service.requestFullscreen(fullscreenElement);
    expect(fullscreenElement.requestFullscreen).toHaveBeenCalled();

    const originalExitFullscreen = document.exitFullscreen;
    const exitFullscreen = jest.fn(() => Promise.resolve());
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: exitFullscreen,
    });
    service.exitFullscreen();
    expect(exitFullscreen).toHaveBeenCalled();
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: originalExitFullscreen,
    });

    const svg = service.createElementNS("http://www.w3.org/2000/svg", "svg");
    expect(svg?.tagName.toLowerCase()).toBe("svg");

    const root = document.createElement("div");
    root.innerHTML = '<span class="one"></span><span class="one"></span>';
    expect(service.querySelector(root, ".one")).toBeInstanceOf(HTMLSpanElement);
    expect(service.querySelectorAll(root, ".one")).toHaveLength(2);

    window.removeEventListener("platform-custom", detailListener as EventListener);
    window.removeEventListener("platform-plain", plainListener as EventListener);
  });

  it("returns safe fallbacks when browser APIs are unavailable or throw", () => {
    TestBed.configureTestingModule({});
    const service = TestBed.inject(BrowserPlatformService);
    (
      service as unknown as {
        document: (Document & { defaultView?: Window | null }) | null;
      }
    ).document = null;

    expect(service.window).toBeNull();
    expect(service.readCssVar("--missing", "fallback")).toBe("fallback");
    expect(service.getStorageItem("missing")).toBeNull();
    expect(service.createElementNS("http://www.w3.org/2000/svg", "svg")).toBeNull();
    expect(service.querySelector(null, ".missing")).toBeNull();
    expect(service.querySelectorAll(null, ".missing")).toEqual([]);
    expect(() => service.dispatchWindowEvent("ignored", true)).not.toThrow();
    expect(() => service.downloadBlob(new Blob(["x"]), "ignored.txt")).not.toThrow();
    expect(() => service.requestFullscreen(null)).not.toThrow();
    expect(() => service.exitFullscreen()).not.toThrow();
  });

  it("swallows DOM errors from storage, selectors, and fullscreen calls", () => {
    TestBed.configureTestingModule({});
    const service = TestBed.inject(BrowserPlatformService);

    jest
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation((): never => {
        throw new Error("storage read failed");
      });
    jest
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation((): never => {
        throw new Error("storage write failed");
      });
    jest
      .spyOn(Storage.prototype, "removeItem")
      .mockImplementation((): never => {
        throw new Error("storage remove failed");
      });

    expect(service.getStorageItem("broken")).toBeNull();
    expect(() => service.setStorageItem("broken", "value")).not.toThrow();
    expect(() => service.removeStorageItem("broken")).not.toThrow();

    const failingRoot = {
      querySelector: jest.fn((): never => {
        throw new Error("bad selector");
      }),
      querySelectorAll: jest.fn((): never => {
        throw new Error("bad selector");
      }),
    } as unknown as Element;
    expect(service.querySelector(failingRoot, "???")).toBeNull();
    expect(service.querySelectorAll(failingRoot, "???")).toEqual([]);

    const failingElement = {
      requestFullscreen: jest.fn((): never => {
        throw new Error("fullscreen failed");
      }),
    } as unknown as HTMLElement;
    expect(() => service.requestFullscreen(failingElement)).not.toThrow();

    const originalExitFullscreen = document.exitFullscreen;
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: jest.fn((): Promise<void> => {
        throw new Error("exit failed");
      }),
    });
    expect(() => service.exitFullscreen()).not.toThrow();
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: originalExitFullscreen,
    });
  });
});
