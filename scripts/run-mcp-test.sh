#!/usr/bin/env bash
# Builds, starts the app against mock providers + a local DB, runs the MCP HTTP test.
set -e
cd "$(dirname "$0")/.."
rm -f /tmp/kids-http.db
export TURSO_DATABASE_URL=file:/tmp/kids-http.db KIE_API_BASE=http://localhost:4801 MERGER_API_BASE=http://localhost:4802
cat > /tmp/mocks.ts <<EOT
import { startMocks } from "$PWD/scripts/mock-servers";
import { addKey } from "$PWD/src/lib/keys";
startMocks(4801, 4802);
(async () => { for (const k of ["bad-key-000000","good-key-000000"]) await addKey("kie", k, k); console.log("mocks ready"); })();
EOT
npx tsx /tmp/mocks.ts & MOCK=$!
npx next start -p 4810 > /tmp/next.log 2>&1 & NEXT=$!
trap "kill $MOCK $NEXT 2>/dev/null" EXIT
for i in $(seq 1 30); do curl -s localhost:4810/api/health >/dev/null && break; sleep 1; done
echo "--- health"; curl -s localhost:4810/api/health; echo
echo "--- mcp"; npx tsx scripts/test-mcp.ts
