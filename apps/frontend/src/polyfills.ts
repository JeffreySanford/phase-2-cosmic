// Polyfills loaded before Angular bootstraps.
// Provide a safe runtime $localize shim for Angular template i18n markers.
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
