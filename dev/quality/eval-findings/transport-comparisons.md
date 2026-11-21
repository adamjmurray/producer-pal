# Transport comparisons

Whether the way a model is reached changes its eval score. The index is
[README.md](README.md).

## Luna: Codex CLI vs the OpenAI API (Nov 2026)

**The Codex transport does not lower Luna's score, so `codex-code/luna` stands
for Luna.** Qwen3.8-flash-next's lead over Luna on matched scenarios (97.7% in
run 37 against 96.4% in run 34) is not a transport cost.

24 scenarios, 3 trials each, one transport after the other on a freshly
restarted Live 12.4.16: the 9 scenarios Luna failed in run 34 plus 15 picked at
random from the 122 it passed 3/3. Debug build of `ad572ecaf`, both at
`--thinking high`, `--decider jev` with Luna at high effort judging escalations.
The API run kept the pre-filled connect turn; Codex always runs it live.

```bash
scripts/eval -m codex-code/luna --thinking high --decider jev -j codex-code/luna --judge-thinking high -r 3
scripts/eval -m openai/gpt-6-luna --thinking high --decider jev -j codex-code/luna --judge-thinking high -r 3
```

| per trial               | Codex CLI   | OpenAI API |
| ----------------------- | ----------- | ---------- |
| Pass                    | 69/72 (96%) | 72/72      |
| Harness or budget fails | 0           | 0          |
| Turns                   | 3.1         | 3.0        |
| Tool calls              | 5.9         | 5.7        |
| Input tokens            | 501K        | 196K       |
| Output tokens           | 2,596       | 997        |
| Reasoning tokens        | 1,175       | 686        |
| Scenario time           | 65.5s       | 29.6s      |

- **The gap is noise.** 3 fails against 0 in 72 trials each is p ≈ 0.25 (Fisher
  exact). At this size it takes about 7 more fails on one side to mean
  something, and 3 trials of one scenario say nothing.
- **All three fails were the model,** the same misses as run 34:
  `legato-transforms` 1/3 (hand-picked offsets once, `swing()` once, instead of
  `rand()`) and `note-ops-merge` 2/3 (deleted and rewrote the notes instead of
  `merge()`, one lane starting a beat early). The other 22 scenarios were 3/3 on
  both.
- **The step budget did not bite.** `library-search-fanout`, the budget fail of
  run 34, passed 3/3 on Codex at 11.3 tool calls a trial; the API took 4.3.
- **The live connect turn costs time, not passes.** It is about 36K input tokens
  and 10s of each Codex trial: 7% of its input and 16% of its time. Every one
  made a single `ppal-connect` call. Without it Codex still sends 2.4x the input
  and takes 1.9x as long.
- **`legato-transforms` is the one to watch.** On Codex it is 7/11 across run
  34, its re-run and this check, against 3/3 on the API. That is not significant
  either (p ≈ 0.33); 10 or more trials on each transport would settle it.
- **Not checked:** that the API applied high effort beyond the run header saying
  so, and whether Codex counts output tokens the way the API does.

Qwen's lead itself is about 1.3 points on some 400 trials a side, which is
within noise for one pair of runs. What this check rules out is the transport as
its cause.
