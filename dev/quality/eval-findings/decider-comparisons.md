# Decider comparisons

How decision models compare as the first eval judge (`--decider`), measured
offline on saved results. The index is [README.md](README.md); how to run the
tools is in `evals/README.md`.

## Local Ollama models vs Jev (Nov 2026)

**Neither local model can stand in for Jev yet.** pplx-decider-flash agrees with
Jev most often but passed every real failure; autotrust-jev made no wrong calls
but escalates too often to save LLM judging.

Run `2026-11-10T07-25-04Z` (Luna at high thinking and Haiku 5.5, 3 trials,
judged with `--jev` and Luna as the escalation judge), 155 judged results. The
baseline is the Jev answer (jev-1.14.0) saved in each result:

```bash
npm run probe:decider -- 2026-11-10T07-25-04Z --baseline=recorded --decider=ollama/autotrust-jev
```

|                                                | Jev   | pplx-decider-flash (4B) | autotrust-jev (9B) |
| ---------------------------------------------- | ----- | ----------------------- | ------------------ |
| Same verdict as Jev                            | —     | 76%                     | 46%                |
| Escalated                                      | 25%   | 7%                      | 59%                |
| Escalations caused by the claims question      | 17/39 | 0/11                    | 38/91              |
| Wrong calls on the 39 results with LLM verdict | —     | 6                       | 0                  |
| Outcome score correlation with Jev             | —     | 0.45                    | −0.07              |
| Seconds per call (M-series Mac, MLX)           | —     | 0.9                     | 1.5                |

- **pplx-decider-flash passed all 4 results the LLM judge failed** (all
  `device-option-params`; Jev escalated each), and failed 2
  `context-onboarding-stays-quiet` results the LLM judge passed. Its claims
  answer never fell below 0.7, so the claims check never stopped one of its
  passes.
- **autotrust-jev escalated 67 of Jev's 115 passes**, 38 of all its escalations
  through the claims question (correlation with Jev's claims answer 0.03). It
  failed 2 results Jev passed; neither has an LLM verdict to settle it. Its
  outcome scores carry no signal.

Caveats:

- **Few failures.** Jev failed 1 result and the LLM judge 4, so this mostly
  measures agreement on passes, not catching failures.
- **Thresholds are Jev's.** The pass (0.85), fail (0.3) and claims (0.7) lines
  were tuned on Jev. autotrust-jev's probabilities sit lower (0.46–0.52 where
  Jev gave 0.84 on the same question), so thresholds of its own might cut its
  escalations a lot.
- **Outcome scales differ.** The recorded Jev answers use the 4-level outcome;
  the local models were asked the 6-level one that autotrust-jev requires.
  Scores are compared as a share of each scale. `--baseline=jev` calls Jev fresh
  with 6 levels.

**Memory:**

- **pplx-decider-flash blows up on long inputs.** The three longest results
  (`device-option-params` on Luna, 13–15K tokens, well inside its 32K context)
  took 5–24 seconds each and pushed the runner to about 96 GB, leaving a 128 GB
  Mac with no free memory. Every other result took about a second. The same
  calls were slow in both full runs.
- **autotrust-jev stays flat.** It held at 19–24 GB on the same 155 results,
  including those three. That's mostly its context: it sets no context length,
  so Ollama loads it at the full 256K tokens (19 GB vs 11 GB of weights). A copy
  of the model with `PARAMETER num_ctx 32768` would avoid that; the decision API
  takes no per-request options.
