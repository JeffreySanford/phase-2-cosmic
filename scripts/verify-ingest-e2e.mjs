#!/usr/bin/env node

/**
 * PR41 full-path acceptance probe.
 *
 * Run this while the geo collector profile, java-ingest, frontend server, and
 * Angular application are active. The probe opens the real application in a
 * headless browser and waits until Angular itself has consumed one repaired-path
 * event through IngestEventStreamService.
 *
 * No event is manufactured at the API boundary. A pass therefore proves the
 * browser observed the identity/provenance that originated upstream:
 *
 * generator -> regional Pulsar -> collector -> Kafka -> java-ingest
 *   -> frontend API -> SSE -> Angular -> DOM acceptance marker
 */

import { chromium } from "playwright";

const appUrl = process.env.INGEST_APP_URL ?? "http://127.0.0.1:4000/";
const timeoutMs = Number(process.env.INGEST_E2E_TIMEOUT_MS ?? 45000);
const selector = '[data-testid="ingest-pipeline-evidence"]';

function fail(message) {
  console.error(`[ingest-e2e] FAIL: ${message}`);
  process.exitCode = 1;
}

function validate(evidence) {
  if (evidence.broker !== "kafka") {
    return `expected broker=kafka, got ${JSON.stringify(evidence.broker)}`;
  }
  if (!evidence.eventId) {
    return "eventId is missing from Angular evidence";
  }
  if (!evidence.region) {
    return "collector region is missing from Angular evidence";
  }
  if (!evidence.source) {
    return "source is missing from Angular evidence";
  }
  return null;
}

async function main() {
  console.log(`[ingest-e2e] opening Angular application at ${appUrl}`);

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto(appUrl, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });

    console.log(
      "[ingest-e2e] waiting for Angular to consume one repaired-path event"
    );

    await page.waitForFunction(
      (evidenceSelector) => {
        const element = document.querySelector(evidenceSelector);
        if (!element) return false;
        return Boolean(
          element.getAttribute("data-event-id") &&
            element.getAttribute("data-region") &&
            element.getAttribute("data-source") &&
            element.getAttribute("data-broker") === "kafka"
        );
      },
      selector,
      { timeout: timeoutMs }
    );

    const evidence = await page.locator(selector).evaluate((element) => ({
      eventId: element.getAttribute("data-event-id") ?? "",
      region: element.getAttribute("data-region") ?? "",
      source: element.getAttribute("data-source") ?? "",
      broker: element.getAttribute("data-broker") ?? "",
    }));

    const error = validate(evidence);
    if (error) {
      fail(error);
      return;
    }

    console.log(
      JSON.stringify(
        {
          result: "PASS",
          observedAt: "Angular",
          ...evidence,
        },
        null,
        2
      )
    );
  } catch (error) {
    const message =
      error?.name === "TimeoutError"
        ? `timed out after ${timeoutMs} ms waiting for Angular pipeline evidence`
        : String(error);
    fail(message);
  } finally {
    await browser?.close();
  }
}

await main();
