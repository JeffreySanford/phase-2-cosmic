#!/usr/bin/env bash
# verify that no circular dependencies exist in the Nx workspace
# usage: ./scripts/check-dep-graph.sh
set -euo pipefail

echo "Scanning Nx dependency graph for cycles..."

graph_file="$(mktemp)"
trap 'rm -f "$graph_file"' EXIT

NX_DAEMON=false pnpm nx graph --print > "$graph_file"

node - "$graph_file" <<'NODE'
const fs = require("node:fs");

const graphPath = process.argv[2];
const graph = JSON.parse(fs.readFileSync(graphPath, "utf8")).graph;
const dependencies = graph.dependencies ?? {};
const visiting = new Set();
const visited = new Set();
const stack = [];

function dependencyTargets(project) {
  return (dependencies[project] ?? [])
    .map((dependency) => dependency.target)
    .filter((target) => graph.nodes[target]);
}

function visit(project) {
  if (visiting.has(project)) {
    const start = stack.indexOf(project);
    const cycle = stack.slice(start).concat(project).join(" -> ");
    throw new Error(`Nx dependency cycle detected: ${cycle}`);
  }
  if (visited.has(project)) return;

  visiting.add(project);
  stack.push(project);
  for (const target of dependencyTargets(project)) {
    visit(target);
  }
  stack.pop();
  visiting.delete(project);
  visited.add(project);
}

for (const project of Object.keys(graph.nodes)) {
  visit(project);
}
NODE

echo "dependency graph check passed"
