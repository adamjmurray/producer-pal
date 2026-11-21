#!/bin/bash
# usage: wt-e2e.sh <worktree-name> <marker-string> [--remote-script] <e2e file filters...>
# Builds the worktree (debug), copies the device files into the main checkout, checks the marker, runs e2e.
# Live loads the device from the main checkout, so without the copy e2e tests stale code.
set -u
root=$(cd "$(dirname "$0")/../../.." && pwd)
wt=$root/.claude/worktrees/$1; marker=$2; shift 2
log=$root/scratchpad/$(basename "$wt")-build.log
script=e2e:mcp
if [ "${1:-}" = "--remote-script" ]; then script=e2e:mcp:remote-script; shift; fi
cd "$wt" || exit 1
npm run -s build:debug > "$log" 2>&1 || { echo "BUILD FAILED"; tail -20 "$log"; exit 1; }
for f in chat-ui.html chat-ui.inputs.json live-api-adapter.js mcp-server.mjs; do
  cp "$wt/max-for-live-device/$f" "$root/max-for-live-device/$f"
done
if [ -n "$marker" ]; then
  grep -q -- "$marker" "$root/max-for-live-device/live-api-adapter.js" "$root/max-for-live-device/mcp-server.mjs" \
    || { echo "MARKER NOT FOUND: $marker"; exit 1; }
fi
npm run "$script" -- "$@"
