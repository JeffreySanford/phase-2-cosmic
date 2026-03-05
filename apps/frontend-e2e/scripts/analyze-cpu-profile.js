const fs = require("fs");
const path = require("path");

function loadProfile(file) {
  const raw = fs.readFileSync(file, "utf8");
  return JSON.parse(raw);
}

function analyze(profile) {
  // Chrome CPU Profile v8 format: nodes[] and samples[]
  const nodes = profile.nodes || [];
  const samples = profile.samples || [];
  const timeDeltas = profile.timeDeltas || profile.timestamps || [];

  // Build map nodeId -> callFrame string
  const idToName = new Map();
  for (const n of nodes) {
    const cf = n.callFrame || {};
    const name = cf.functionName || "(anonymous)";
    const url = cf.url || cf.scriptId || "";
    const line = cf.lineNumber != null ? cf.lineNumber : "";
    idToName.set(n.id, `${name} -- ${url}:${line}`);
  }

  // If timeDeltas present, assume sampling interval approximated by sum(timeDeltas)/samples.length
  // We'll count occurrences per node id
  const counts = new Map();
  for (const sid of samples) {
    counts.set(sid, (counts.get(sid) || 0) + 1);
  }

  // Convert to array with readable names
  const arr = [];
  for (const [id, cnt] of counts.entries()) {
    arr.push({ id, count: cnt, name: idToName.get(id) || String(id) });
  }

  // Sort by count desc
  arr.sort((a, b) => b.count - a.count);

  return { totalSamples: samples.length, top: arr.slice(0, 50) };
}

(async () => {
  try {
    const file = path.resolve(
      __dirname,
      "..",
      "profile-output",
      "cpu-profile.json"
    );
    const profile = loadProfile(file);
    const result = analyze(profile);
    const out = path.resolve(
      __dirname,
      "..",
      "profile-output",
      "cpu-analysis.json"
    );
    fs.writeFileSync(out, JSON.stringify(result, null, 2));
    console.log("Analysis written to", out);
    console.log("Top samples:");
    console.table(result.top.slice(0, 20));
  } catch (err) {
    console.error("Failed to analyze profile:", err);
    process.exit(1);
  }
})();
