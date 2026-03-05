const { chromium } = require("playwright");
const fs = require("fs");

(async () => {
  const consoleLogs = [];
  const networkLogs = [];
  // run headful so you can inspect if needed; slowMo to make interactions visible
  const browser = await chromium.launch({
    headless: false,
    slowMo: 25,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  // increase default timeout for slow dev servers
  page.setDefaultTimeout(120000);

  page.on("console", (msg) => {
    try {
      consoleLogs.push({ type: msg.type(), text: msg.text() });
    } catch (e) {
      consoleLogs.push({ type: "console", text: String(msg) });
    }
  });
  page.on("pageerror", (err) =>
    consoleLogs.push({ type: "pageerror", text: err.message })
  );

  // capture network requests/responses
  page.on("request", (req) => {
    networkLogs.push({
      type: "request",
      method: req.method(),
      url: req.url(),
      headers: req.headers(),
    });
  });
  page.on("response", async (res) => {
    try {
      const headers = res.headers();
      const ct = headers["content-type"] || "";
      let body = "";
      if (ct.includes("application/json") || ct.includes("text")) {
        try {
          body = await res.text();
          if (body && body.length > 20000) body = body.slice(0, 20000) + "...";
        } catch {}
      }
      networkLogs.push({
        type: "response",
        status: res.status(),
        url: res.url(),
        headers,
        body,
      });
    } catch (e) {
      networkLogs.push({
        type: "response",
        status: res.status(),
        url: res.url(),
        err: String(e),
      });
    }
  });

  const url = "http://localhost:4200/telemetry";
  console.log("navigating to", url);
  await page.goto(url, { waitUntil: "networkidle" });

  // Wait for the D3 line path to be rendered (non-empty 'd' attribute)
  try {
    await page.waitForSelector(".chart svg", { timeout: 120000 });
    await page.waitForFunction(
      () => {
        const p = document.querySelector(".chart svg path.line");
        return !!(
          p &&
          p.getAttribute &&
          p.getAttribute("d") &&
          p.getAttribute("d").length > 10
        );
      },
      { timeout: 120000 }
    );
  } catch (e) {
    console.warn(
      "Timed out waiting for D3 line, continuing to capture whatever is present"
    );
  }

  await page.waitForTimeout(500);

  const shotPath = "telemetry-screenshot.png";
  await page.screenshot({ path: shotPath, fullPage: false });
  fs.writeFileSync(
    "telemetry-console.json",
    JSON.stringify(consoleLogs, null, 2)
  );
  console.log("screenshot saved:", shotPath);
  console.log("console log saved: telemetry-console.json");

  try {
    // close browser normally
    await browser.close();
  } catch (err) {
    // write logs and keep browser open for manual inspection
    fs.writeFileSync(
      "telemetry-console.json",
      JSON.stringify(consoleLogs, null, 2)
    );
    console.error("Error during capture:", String(err));
    console.error(
      "Wrote telemetry-console.json. Leaving browser open for inspection."
    );
    // keep process alive so you can inspect the open browser
    // eslint-disable-next-line no-constant-condition
    await new Promise(() => {});
  }
})();
