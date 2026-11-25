#!/bin/bash
# usage: ci-wait.sh <sha>
# Waits until every workflow run and check-run on <sha> completes, then prints:
#   GREEN    exit 0
#   RED      exit 1  (a failure, a cancel, or a failing commit status)
#   NOBUILD  exit 3  (no workflow run appeared: not the head of an open PR)
#   CONFLICT exit 5  (its PR conflicts with the base, so nothing builds)
#   STUCK    exit 4  (a run sat queued with no jobs: a GitHub flake)
# CI_WAIT_DELAY overrides the initial wait (seconds, default 60).
sha=$1
[ -n "$sha" ] || { echo "usage: ci-wait.sh <sha>"; exit 2; }
root=$(cd "$(dirname "$0")/../../.." && pwd)
cd "$root" || exit 1
repo=$(gh repo view --json nameWithOwner -q .nameWithOwner)
# The runs API only matches a full sha.
full=$(gh api "repos/$repo/commits/$sha" --jq .sha) || exit 2

NOBUILD_AFTER=600 # seconds after the commit was pushed with no workflow run
STUCK_AFTER=1200  # seconds a run may sit queued with no jobs

# A queued run has no check-runs yet, so check-runs alone can read green while
# the real build hasn't started. Workflow runs show it.
workflow_runs() {
  gh api "repos/$repo/actions/runs?head_sha=$full&per_page=50" \
    --jq '.workflow_runs[] | "\(.status)\t\(.conclusion)\t\(.name)\t\(.id)\t\(now - (.created_at | fromdateiso8601) | floor)"' 2>/dev/null
}

check_runs() {
  gh api "repos/$repo/commits/$full/check-runs?per_page=100" \
    --jq '.check_runs[] | "\(.status)\t\(.conclusion)\t\(.name)"' 2>/dev/null
}

stuck_runs() {
  echo "$1" | awk -F'\t' -v max="$STUCK_AFTER" '$1=="queued" && $5>max {print $4"\t"$3"\t"$5}' |
    while IFS=$'\t' read -r id name age; do
      jobs=$(gh api "repos/$repo/actions/runs/$id/jobs" --jq .total_count 2>/dev/null)
      [ "$jobs" = "0" ] && echo "$name: queued ${age}s with no jobs (run $id)"
    done
}

# CI builds a PR as merged into its base, so a PR that conflicts gets no run.
# Prints the conflicting PR that <sha> heads, as "<number> <head> <base>".
conflicting_pr() {
  gh api "repos/$repo/commits/$full/pulls" \
    --jq ".[] | select(.state==\"open\" and .head.sha==\"$full\") | .number" 2>/dev/null |
    while read -r number; do
      gh pr view "$number" --repo "$repo" --json mergeable,number,headRefName,baseRefName \
        --jq 'select(.mergeable=="CONFLICTING") | "\(.number) \(.headRefName) \(.baseRefName)"'
    done | head -1
}

pushed_age=$(gh api "repos/$repo/commits/$full" --jq '(now - (.commit.committer.date | fromdateiso8601)) | floor')

sleep "${CI_WAIT_DELAY:-60}"
prev=-1
for i in $(seq 1 120); do
  wf=$(workflow_runs)
  runs=$(check_runs)

  if [ -z "$wf" ]; then
    read -r pr head base <<<"$(conflicting_pr)"
    if [ -n "$pr" ]; then
      echo "CONFLICT"
      echo "PR #$pr ($head → $base) conflicts with $base, so CI built nothing for $full."
      echo "Merge $base into $head, resolve the conflicts and push: every commit needs a green build."
      exit 5
    fi
    age=$((pushed_age + i * 30))
    if [ "$age" -gt "$NOBUILD_AFTER" ]; then
      echo "NOBUILD"
      echo "No workflow run for $full. CI only builds the head of an open PR."
      exit 3
    fi
    sleep 30
    continue
  fi

  stuck=$(stuck_runs "$wf")
  if [ -n "$stuck" ]; then
    echo "$wf" | cut -f1-3
    echo "STUCK"
    echo "$stuck"
    echo "It can't be cancelled or re-run. Recreate the commit (same tree, new signature) and force-push it."
    exit 4
  fi

  wf_pending=$(echo "$wf" | grep -vc '^completed')
  n=$(echo "$runs" | grep -c .)
  pending=$(echo "$runs" | grep -vc '^completed')
  # Check-runs appear over time, so stop only once the count held for a poll.
  if [ "$wf_pending" -eq 0 ] && [ "$pending" -eq 0 ] && [ "$n" -eq "$prev" ]; then break; fi
  prev=$n
  sleep 30
done

echo "$wf" | cut -f1-3
echo "$runs"
gh api "repos/$repo/commits/$full/status" --jq '"status: " + .state, (.statuses[]? | "\(.state)\t\(.context)")'
ok='$2=="success" || $2=="neutral" || $2=="skipped"'
bad=$( { echo "$wf" | cut -f1-3; echo "$runs"; } | grep . | awk -F'\t' "\$1!=\"completed\" || !($ok)")
st=$(gh api "repos/$repo/commits/$full/status" --jq .state)
if [ -n "$bad" ] || { [ "$st" != "success" ] && [ "$st" != "pending" ]; }; then echo "RED"; echo "$bad"; exit 1; fi
echo GREEN
