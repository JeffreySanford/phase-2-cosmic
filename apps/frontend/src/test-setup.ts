// Provide Angular localize support for templates using i18n markers.
// This is required because some components include i18n attributes and
// the compiled output uses `$localize`.
type LocalizeGlobal = typeof globalThis & {
  $localize?: (
    messageParts: TemplateStringsArray,
    ...substitutions: readonly unknown[]
  ) => string;
};

const localizeGlobal = globalThis as LocalizeGlobal;

if (typeof localizeGlobal.$localize !== "function") {
  localizeGlobal.$localize = (
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

  const isBenignProxyOrRuntimeError = args.some((a) => {
    if (typeof a !== "string") {
      return false;
    }

    return (
      a.startsWith("Error proxying to Forge API:") ||
      a.startsWith("Error proxying Forge artifact:") ||
      a.startsWith("Error proxying to governance API:") ||
      a.startsWith("[runtime-load docker-") ||
      a.includes("docker run failed: simulated container start failure")
    );
  });

  if (isCssWarning || isBenignProxyOrRuntimeError) {
    return;
  }
  originalConsoleError.apply(console, args);
};

// suppress known runtime-load warnings that are expected in unit tests and
// otherwise drown out real failures.
const originalConsoleWarn = console.warn;
type ConsoleWarnArg = string | Error | unknown;
console.warn = (...args: ConsoleWarnArg[]) => {
  const isBenignRuntimeLoadWarning = args.some((a) => {
    if (typeof a !== "string") {
      return false;
    }

    return (
      a.includes("dockerode not available; falling back to docker CLI") ||
      a.includes(
        "Stress load is disabled via STRESS_DISABLE=true; ignoring profile changes."
      ) ||
      a.includes("Stress worker count adjusted from") ||
      a.includes("[runtime-load docker-") ||
      a.includes("[runtime-load worker-") ||
      a.startsWith("Falling back to mock infrastructure telemetry:")
    );
  });

  if (isBenignRuntimeLoadWarning) {
    return;
  }

  originalConsoleWarn.apply(console, args);
};

import { setupZoneTestEnv } from "jest-preset-angular/setup-env/zone";

setupZoneTestEnv();
