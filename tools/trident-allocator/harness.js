#!/usr/bin/env node
// Minimal harness for the FSP allocator simulator.
// Run `node tools/trident-allocator/harness.js` from workspace root.

const path = require("path");
const { allocate } = require(path.join(__dirname, "allocator.js"));

const sample = {
  id: "sb-sample",
  subarray: "subarray-1",
  startTime: "2026-04-01T00:00:00Z",
  endTime: "2026-04-01T01:00:00Z",
  metadata: { fspsRequested: 13 },
};

console.log("Proposing SchedulingBlock:", sample);
const result = allocate(sample, null, []);
console.log("Result:", JSON.stringify(result, null, 2));
