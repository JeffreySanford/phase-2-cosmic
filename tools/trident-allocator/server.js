/* eslint-disable no-undef, @typescript-eslint/no-require-imports */
"use strict";

const http = require("http");
const { allocate } = require("./allocator");

const PORT = Number(process.env.ALLOCATOR_PORT) || 7777;

/** Read the full request body as a string. */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/** Write a JSON response. */
function json(res, status, body) {
  const payload = JSON.stringify(body);
  // allow cross‑origin requests for the frontend dev server on 4200
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(payload);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // always respond to preflight so browser can talk to us
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  // Health probe
  if (req.method === "GET" && url.pathname === "/health") {
    json(res, 200, { status: "ok", service: "trident-allocator" });
    return;
  }

  // Allocation endpoint
  if (req.method === "POST" && url.pathname === "/allocate") {
    let body;
    try {
      const raw = await readBody(req);
      body = JSON.parse(raw);
    } catch {
      json(res, 400, { error: "BAD_REQUEST", message: "Invalid JSON body" });
      return;
    }

    const { schedulingBlock, spectralConfig, existingAllocations } = body ?? {};

    if (!schedulingBlock) {
      json(res, 400, {
        error: "BAD_REQUEST",
        message: "Missing required field: schedulingBlock",
      });
      return;
    }

    const result = allocate(
      schedulingBlock,
      spectralConfig ?? null,
      existingAllocations ?? []
    );

    if (result.error) {
      const status = result.error.code === "INVALID_SPECTRAL" ? 422 : 409;
      json(res, status, result.error);
      return;
    }

    json(res, 200, result.plan);
    return;
  }

  json(res, 404, { error: "NOT_FOUND", path: url.pathname });
});

if (require.main === module) {
  server.listen(PORT, "127.0.0.1", () => {
    process.stdout.write(
      `trident-allocator listening on http://127.0.0.1:${PORT}\n`
    );
  });
}

module.exports = { server };
