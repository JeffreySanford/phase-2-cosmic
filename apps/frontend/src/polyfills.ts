// Polyfills loaded before Angular bootstraps.
// Provide a safe runtime $localize shim for Angular template i18n markers.
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
