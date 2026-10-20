# Recorded runs

Every full-suite eval run, with its commit and totals. Per-scenario results are
in [scenario-results.md](scenario-results.md); the index is
[README.md](README.md).

`evals/results/` is gitignored, so a run stays comparable only if its numbers
are here. **Record the commit.** Without one, a diff between two runs credits
the model for a fix that landed in between: `duplicate-loop` read as "luna
fails, gemma passes" until run 2 turned out to predate the refusal of
`start`/`length` beside `duplicateLoop`.

| #   | model            | mode            | commit       | trials | ran | pass      | input  | wall  |
| --- | ---------------- | --------------- | ------------ | ------ | --- | --------- | ------ | ----- |
| 1   | gpt-5.6-luna     | default         | not recorded | 3      | 231 | 186 (81%) | 84.4M  | 2h05m |
| 2   | gpt-5.6-luna     | default         | `c3a8484fb`  | 3      | 276 | 249 (90%) | 115.4M | 3h23m |
| 3   | gemma-4-26b-a4b  | `--small-model` | `90ead3407`  | 1      | 59  | 41 (69%)  | 3.4M   | 33m   |
| 4   | gemma-4-26b-a4b  | `--small-model` | `90ead3407`  | 1      | 59  | 40 (68%)  | 3.1M   | 35m   |
| 5   | gemma-4-26b-a4b  | default         | `90ead3407`  | 1      | 92  | 74 (80%)  | 17.0M  | 1h04m |
| 6   | gpt-5.6-luna     | default         | `b2e472eb0`  | 3      | 64  | 45 (70%)  | 51.6M  | 1h12m |
| 7   | gpt-5.6-luna     | default         | `92c6e7f06`  | 3      | 301 | 264 (88%) | 129.7M | 4h00m |
| 8   | gpt-5.6-luna     | default         | `47adbc056`  | 3      | 301 | 270 (90%) | 124.6M | 2h56m |
| 9   | gpt-5.6-luna     | default         | `d5971a5bd`  | 3      | 301 | 273 (91%) | 130.7M | 4h11m |
| 10  | gpt-5.6-luna     | default         | `ba97d9173`  | 3      | 300 | 268 (89%) | 131.0M | 2h52m |
| 11  | qwen3.8-27b      | `--small-model` | `ba97d9173`  | 1      | 65  | 55 (85%)  | 4.1M   | 1h31m |
| 12  | qwen3.8-27b      | `--small-model` | `ba97d9173`  | 1      | 65  | 54 (83%)  | 3.8M   | 1h17m |
| 13  | qwen3.8-27b      | `--small-model` | `ba97d9173`  | 1      | 65  | 56 (86%)  | 4.4M   | 1h39m |
| 14  | gpt-6-luna       | default         | `3a468481c`  | 2      | 198 | 173 (87%) | 98.4M  | 1h58m |
| 15  | gpt-6-luna       | default         | `144eead60`  | 3      | 355 | 317 (89%) | 167.1M | 4h15m |
| 16  | gemma-4-31b      | `--small-model` | `144eead60`  | 1      | 74  | 66 (89%)  | 4.0M   | 2h06m |
| 17  | gemma-4-31b      | `--small-model` | `144eead60`  | 1      | 75  | 63 (84%)  | 4.4M   | 2h08m |
| 18  | gpt-6-luna       | default         | `4852e3680`+ | 3      | 381 | 341 (90%) | 174.2M | 3h24m |
| 19  | claude-haiku-5-5 | default         | `4852e3680`+ | 3      | 381 | 375 (98%) | 102.2M | 1h14m |

**Run 6 was stopped after 22 of 101 scenarios** and is not a suite result — the
70% is over the scenarios it reached, which are the expensive front of the list.
It was killed on purpose: `swing-and-quantize` and `melody-transforms` had both
gone 3/3 to 0/3 against run 2, and bisecting that mattered more than finishing.
See
[Where a fragment sits can cost more than what it says](wording-changes.md#where-a-fragment-sits-can-cost-more-than-what-it-says).
Do not compare its percentage to any full run.

**Run 15 is missing six scenarios** new in 2.5.0, which were not registered yet,
and 2 of its trials never ran. Runs 16 and 17 are n=1, so a single red cell is
noise.

**Runs 18 and 19 are stitched across two commits.** The full suite ran at
`4852e3680`. Three eval fixes then landed: the graders read every successful
call in a turn, a `reuseLiveSet` scenario no longer inherits a Set a non-reuse
scenario changed, and `synced-lfo-meter-invariance` asks for an LFO shape. The
33 scenarios those fixes touch were re-run at ×3 on `5ab932b03` and replace
their full-run trials. Product code moved 5 commits in between, none touching
what a successful clip or transform write returns. As run, before the stitch:
luna 331 (87%), haiku 370 (97%). Wall is scenario time. Run 19 is the first
recorded Anthropic API run.

Runs 1-9, 14 and 18-19 are `--skip-judge`, so they are deterministic checks
only. Runs 10-13 and 15-17 ran the judge, but no trial failed on the judge
alone, so their numbers compare. Gemma and qwen run local (LM Studio,
`-b http://localhost:1234/v1`) and cost nothing, but their token totals measure
the same thing. Small-model mode skips 34 of the 93 scenarios (36 of 101 by run
11).

**Run 10 was stitched from four segments.** Codex refused luna three times in
three hours ("Selected model is at capacity"), and the harness stops after three
scenarios in a row never start. Each restart re-ran only the scenarios still
short of three real trials, and a scenario's three trials always come from one
segment. Its 2h52m is scenario time; the wall clock was ~4.5h. The abort message
now says when the provider, not Live, is the cause.

**Run 14 is a different model.** The eval's `luna` alias moved from
`gpt-5.6-luna` to `gpt-6-luna` on 2026-09-22, so compare it to runs 1-10 as a
model change, not a code change. Run 14 is also n=2, so a single failed trial
moves a cell further than in a ×3 run. Its two `path-topath-devices` trials are
regraded: they failed only on a grader that predated the `d+` append path, fixed
in the commit that recorded the run; as run, the total was 171 (86%). The 0/2
scenarios were re-run at ×2; those extra trials are not in its totals.

**Input tokens are the number to move** when trimming tool and param
descriptions. That is why a run records its totals and not only its failures.

**Runs 3-5 are n=1 and cannot detect a regression.** 11 of 59 small-model
scenarios flipped between runs 3 and 4 — same model, same commit, same flags. A
single red cell in a gemma column is noise, not a finding.
