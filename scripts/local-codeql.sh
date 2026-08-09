#!/usr/bin/env bash
# local-codeql.sh - run the same CodeQL language set locally before CI.
#
# Usage:
#   bash scripts/local-codeql.sh
#   bash scripts/local-codeql.sh javascript-typescript
#   bash scripts/local-codeql.sh java-kotlin
#   bash scripts/local-codeql.sh go

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CODEQL_CACHE="${REPO_ROOT}/tools/codeql"
LOG_ROOT="${REPO_ROOT}/logs/codeql/local"
TIMESTAMP="$(date +%Y%m%dT%H%M%S)"
RUN_ROOT="${LOG_ROOT}/${TIMESTAMP}"

mkdir -p "${RUN_ROOT}"

detect_platform() {
  local os arch
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m | tr '[:upper:]' '[:lower:]')"

  case "${os}" in
    mingw* | msys* | cygwin*) os="win64" ;;
    linux*) os="linux64" ;;
    darwin*) os="osx64" ;;
    *)
      echo "Unsupported OS for automatic CodeQL install: ${os}" >&2
      return 1
      ;;
  esac

  case "${arch}" in
    x86_64 | amd64) ;;
    *)
      echo "Unsupported architecture for automatic CodeQL install: ${arch}" >&2
      return 1
      ;;
  esac

  echo "${os}"
}

ensure_codeql() {
  if command -v codeql >/dev/null 2>&1; then
    command -v codeql
    return 0
  fi

  local platform bundle archive codeql_bin
  platform="$(detect_platform)"
  bundle="https://github.com/github/codeql-action/releases/latest/download/codeql-bundle-${platform}.tar.gz"
  archive="${CODEQL_CACHE}/codeql-bundle-${platform}.tar.gz"
  codeql_bin="${CODEQL_CACHE}/codeql/codeql"
  if [[ "${platform}" == "win64" ]]; then
    codeql_bin="${CODEQL_CACHE}/codeql/codeql.exe"
  fi

  if [[ ! -x "${codeql_bin}" ]]; then
    mkdir -p "${CODEQL_CACHE}"
    echo "==> Downloading CodeQL bundle: ${bundle}" >&2
    if command -v curl >/dev/null 2>&1; then
      curl -L "${bundle}" -o "${archive}"
    else
      powershell.exe -NoProfile -Command "Invoke-WebRequest -Uri '${bundle}' -OutFile '${archive}'"
    fi

    echo "==> Extracting CodeQL bundle to ${CODEQL_CACHE}" >&2
    tar -xzf "${archive}" -C "${CODEQL_CACHE}"
  fi

  echo "${codeql_bin}"
}

selection_includes_java() {
  local language
  for language in "$@"; do
    if [[ "${language}" == "java-kotlin" ]]; then
      return 0
    fi
  done

  return 1
}

run_java_scan_in_docker_if_needed() {
  if [[ "${CODEQL_LOCAL_CONTAINER:-}" == "1" ]]; then
    return 0
  fi

  if command -v java >/dev/null 2>&1; then
    return 0
  fi

  local docker_bin="docker"
  local mount_root="${REPO_ROOT}"
  if command -v docker.exe >/dev/null 2>&1 && docker.exe version >/dev/null 2>&1; then
    docker_bin="docker.exe"
    if command -v wslpath >/dev/null 2>&1; then
      mount_root="$(wslpath -w "${REPO_ROOT}")"
    fi
  elif ! command -v docker >/dev/null 2>&1 || ! docker version >/dev/null 2>&1; then
    echo "Java was not found on PATH and Docker is unavailable for the local CodeQL Java scan." >&2
    exit 1
  fi

  ensure_codeql >/dev/null
  echo "==> Java was not found on PATH; running Java CodeQL in Docker"
  exec "${docker_bin}" run --rm \
    -e CODEQL_LOCAL_CONTAINER=1 \
    -v "${mount_root}:/workspace" \
    -w /workspace \
    maven:3.9-eclipse-temurin-17 \
    bash ./scripts/local-codeql.sh "$@"
}

run_database_create() {
  local codeql="$1"
  local language="$2"
  local db="$3"
  local source_root="$4"

  echo "==> Creating CodeQL database for ${language} (${source_root})"
  case "${language}" in
    javascript-typescript)
      "${codeql}" database create "${db}" \
        --language=javascript-typescript \
        --source-root="${source_root}" \
        --build-mode=none \
        --overwrite
      ;;
    java-kotlin)
      "${codeql}" database create "${db}" \
        --language=java-kotlin \
        --source-root="${source_root}" \
        --build-mode=none \
        --overwrite
      ;;
    go)
      "${codeql}" database create "${db}" \
        --language=go \
        --source-root="${source_root}" \
        --command="go build ./..." \
        --overwrite
      ;;
    *)
      echo "Unknown CodeQL language: ${language}" >&2
      exit 2
      ;;
  esac

}

run_database_analyze() {
  local codeql="$1"
  local language="$2"
  local db="$3"
  local sarif="${RUN_ROOT}/${language}.sarif"

  echo "==> Analyzing ${language}"
  "${codeql}" database analyze "${db}" \
    --format=sarif-latest \
    --output="${sarif}" \
    --sarif-category="/language:${language}"

  echo "    SARIF: ${sarif}"
}

main() {
  cd "${REPO_ROOT}"

  local selected=("$@")
  local specs=()
  if [[ "${#selected[@]}" -eq 0 ]]; then
    selected=("javascript-typescript" "java-kotlin" "go")
  fi

  if selection_includes_java "${selected[@]}"; then
    run_java_scan_in_docker_if_needed "${selected[@]}"
  fi

  for language in "${selected[@]}"; do
    case "${language}" in
      javascript-typescript)
        specs+=("javascript-typescript:${REPO_ROOT}/apps/frontend:frontend")
        specs+=("javascript-typescript:${REPO_ROOT}/apps/frontend-e2e:frontend-e2e")
        specs+=("javascript-typescript:${REPO_ROOT}/libs/ui-theme:ui-theme")
        specs+=("javascript-typescript:${REPO_ROOT}/scripts:scripts")
        specs+=("javascript-typescript:${REPO_ROOT}/tools/telemetry-sidebar:telemetry-sidebar")
        specs+=("javascript-typescript:${REPO_ROOT}/tools/trident-allocator:trident-allocator")
        ;;
      java-kotlin)
        specs+=("java-kotlin:${REPO_ROOT}/apps/java-governance:java-governance")
        specs+=("java-kotlin:${REPO_ROOT}/tools/java-ingest:java-ingest")
        ;;
      go)
        specs+=("go:${REPO_ROOT}/tools/data-generator:data-generator")
        ;;
      *)
        echo "Unknown CodeQL language: ${language}" >&2
        exit 2
        ;;
    esac
  done

  local codeql
  codeql="$(ensure_codeql)"
  echo "==> CodeQL CLI: ${codeql}"
  "${codeql}" version
  echo ""

  for spec in "${specs[@]}"; do
    IFS=":" read -r language source_root label <<<"${spec}"
    local db="${RUN_ROOT}/${label}-${language}-db"
    run_database_create "${codeql}" "${language}" "${db}" "${source_root}"
    run_database_analyze "${codeql}" "${label}-${language}" "${db}"
    echo ""
  done

  echo "==> Local CodeQL complete"
  echo "    Output: ${RUN_ROOT}"
}

main "$@"
