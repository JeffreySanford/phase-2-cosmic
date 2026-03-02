#!/usr/bin/env node
// Simple job publisher for load testing: POSTs jobs to governance API in a loop

import fetch from 'node-fetch';

const url = process.env.GOV_URL || 'http://localhost:8080/api/v1/jobs';
const rate = parseInt(process.env.RATE || '10', 10); // messages per second
const total = parseInt(process.env.TOTAL || '100', 10);

async function publish(i) {
  const body = {
    workflow: 'perf-workflow',
    datasetId: 'perf-' + i,
    parameters: { iteration: i },
    requestedBy: 'perf-script'
  };
  try {
    const res = await fetch(url, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
    const txt = await res.text();
    console.log(i, res.status, txt);
  } catch (e) {
    console.error('publish error', e.toString());
  }
}

(async () => {
  for (let i = 0; i < total; i++) {
    publish(i);
    await new Promise(r => setTimeout(r, 1000 / rate));
  }
})();
