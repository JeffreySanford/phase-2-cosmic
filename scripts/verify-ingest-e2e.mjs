#!/usr/bin/env node

/**
 * PR41 topology-repair acceptance probe.
 *
 * Run this while the geo collector profile, java-ingest, and frontend server are
 * active. It waits for one real SSE event and verifies that identity and
 * attribution generated upstream survived the complete repaired path:
 *
 * generator -> regional Pulsar -> collector -> Kafka -> java-ingest
 *   -> frontend API -> SSE -> Angular-facing contract
 *
 * The probe deliberately does not manufacture an event at the API boundary.
 * It only accepts an event that already carries the generator eventId, collector
 * region, Kafka broker attribution, and source payload.
 */

const endpoint =
  process.env.INGEST_SSE_URL ?? "http://127.0.0.1:4000/api/ingest/stream";
const timeoutMs = Number(process.env.INGEST_E2E_TIMEOUT_MS ?? 30000);

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), timeoutMs);

function fail(message) {
  console.error(`[ingest-e2e] FAIL: ${message}`);
  process.exitCode = 1;
}

function validate(event) {
  const payload = event?.payload;
  const eventId = payload?.eventId;
  const source = event?.source ?? payload?.source;

  if (event?.broker !== "kafka") {
    return `expected broker=kafka, got ${JSON.stringify(event?.broker)}`;
  }
  if (typeof event?.collectorRegion !== "string" || !event.collectorRegion) {
    return "collectorRegion is missing";
  }
  if (typeof source !== "string" || !source) {
    return "source is missing";
  }
  if (typeof eventId !== "string" || !eventId) {
    return "payload.eventId is missing";
  }
  if (payload?.source !== undefined && payload.source !== source) {
    return `source changed across the frontend boundary: ${payload.source} != ${source}`;
  }
  return null;
}

async function main() {
  console.log(`[ingest-e2e] waiting for one repaired-path event at ${endpoint}`);

  let response;
  try {
    response = await fetch(endpoint, {
      headers: { Accept: "text/event-stream" },
      signal: controller.signal,
    });
  } catch (error) {
    fail(`could not connect to SSE endpoint: ${error}`);
    return;
  }

  if (!response.ok || !response.body) {
    fail(`SSE endpoint returned HTTP ${response.status}`);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let separator;
      while ((separator = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);

        const lines = frame.split("\n");
        const eventName = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
        const data = lines
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");

        if (eventName !== "ingest-event" || !data) continue;

        let event;
        try {
          event = JSON.parse(data);
        } catch {
          continue;
        }

        const error = validate(event);
        if (error) {
          console.warn(`[ingest-e2e] ignored non-conforming event: ${error}`);
          continue;
        }

        console.log(
          JSON.stringify(
            {
              result: "PASS",
              eventId: event.payload.eventId,
              region: event.collectorRegion,
              source: event.source ?? event.payload.source,
              broker: event.broker,
              traceId: event.traceId ?? event.payload.traceId ?? null,
            },
            null,
            2
          )
        );
        return;
      }
    }

    fail("SSE stream ended before a conforming repaired-path event arrived");
  } catch (error) {
    if (error?.name === "AbortError") {
      fail(`timed out after ${timeoutMs} ms waiting for a repaired-path event`);
      return;
    }
    fail(`SSE read failed: ${error}`);
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

await main();
