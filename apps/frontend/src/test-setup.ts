// suppress jsdom stylesheet parse warnings that are benign and flood test output
const originalConsoleError = console.error;
type ConsoleErrorArg = string | { type?: string } | Error | unknown;
console.error = (...args: ConsoleErrorArg[]) => {
  const isCssWarning = args.some((a) => {
    if (typeof a === "string") {
      return a.includes("Could not parse CSS stylesheet");
    }
    if (a && typeof a === "object" && "type" in a) {
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

import { setupZoneTestEnv } from "jest-preset-angular/setup-env/zone";

setupZoneTestEnv();
