// Provide Angular localize support for templates using i18n markers.
// This is required because some components include i18n attributes and
// the compiled output uses `$localize`.
if (typeof (globalThis as any).$localize !== "function") {
  (globalThis as any).$localize = (
    messageParts: TemplateStringsArray,
    ...substitutions: readonly unknown[]
  ): string => {
    let text = "";
    for (let i = 0; i < messageParts.length; i++) {
      text += messageParts[i];
      if (i < substitutions.length) {
        text += String(substitutions[i]);
      }
    }
    return text;
  };
}

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
