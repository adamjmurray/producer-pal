#!/bin/bash
# usage: mkwt.sh <name> [base]
# Creates .claude/worktrees/<name> on branch wt/<name>, sharing the main checkout's node_modules and .env.
set -e
root=$(cd "$(dirname "$0")/../../.." && pwd)
name=$1; base=${2:-origin/dev}
[ -n "$name" ] || { echo "usage: mkwt.sh <name> [base]"; exit 2; }
wt=$root/.claude/worktrees/$name
git -C "$root" fetch -q origin
git -C "$root" worktree add -q -B "wt/$name" "$wt" "$base"
ln -s "$root/node_modules" "$wt/node_modules"
ln -s "$root/webui/node_modules" "$wt/webui/node_modules"
ln -s "$root/.env" "$wt/.env"
(cd "$wt" && npm run -s parser:build >/dev/null 2>&1) && echo "$name ready at $(git -C "$wt" log --oneline -1)"
