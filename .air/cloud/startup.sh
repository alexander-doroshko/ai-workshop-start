#!/usr/bin/env bash
# Air cloud startup for Skill Atlas: a Node (>=24) TypeScript CLI run via Node's type stripping, no build step.
set -euo pipefail

if [ "${AIR_STARTUP_MODE:-}" = warmup ]; then WARMUP=1; else WARMUP=; fi

cd "$(dirname "$0")/../.."

# Mirrors CI (.github/workflows/ci.yml): typecheck, tests, and the CLI smoke on the fixture.
healthcheck() {
  echo "[healthcheck] typecheck"
  npm run typecheck
  echo "[healthcheck] tests"
  npm test
  echo "[healthcheck] CLI smoke"
  ./skill-atlas help
  ./skill-atlas scan ./fixture
  echo "[healthcheck] OK"
}

echo "[startup] node $(node -v), npm $(npm -v)"
node -e 'const m=+process.versions.node.split(".")[0]; if (m<24) { console.error("Node >=24 required, found "+process.version); process.exit(1) }'

echo "[startup] npm ci"
npm ci --no-audit --no-fund
echo "[startup] dependencies installed"

if [ -n "$WARMUP" ]; then healthcheck; fi
