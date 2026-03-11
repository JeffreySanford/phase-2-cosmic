// suppress jsdom stylesheet parse warnings that are benign and flood test output
const originalConsoleError = console.error;
console.error = (...args: any[]) => {
  const isCssWarning = args.some((a) => {
    if (typeof a === "string") {
      return a.includes("Could not parse CSS stylesheet");
    }
    if (a && typeof a === "object") {
      // jsdom sometimes logs an object with a `type: 'css parsing'`
      return a.type === "css parsing";
    }
    return false;
  });
  if (isCssWarning) {
    return;
  }
  originalConsoleError.apply(console, args);
};

// assign using type assertion to avoid TS complaints
(globalThis as any).ngJest = {
  testEnvironmentOptions: {
    errorOnUnknownElements: true,
    errorOnUnknownProperties: true,
  },
};
import { setupZoneTestEnv } from "jest-preset-angular/setup-env/zone";

setupZoneTestEnv();
