<!--
Producer Pal
Copyright (C) 2026 Taylor Haun
AI assistance: Claude (Anthropic)
SPDX-License-Identifier: GPL-3.0-or-later
-->

# Model Comparison Evals

A plan + runbook for comparing how different LLMs perform on Producer Pal's
tools — from frontier paid models down to cheap hosted and small local models —
and for finding what we can do to make the cheap/small ones usable.

This grew out of GitHub discussion
[#700](https://github.com/adamjmurray/producer-pal/discussions/700), where Adam
asked specifically for evals that expose where things "work well with the most
powerful paid AI models ... and fall apart with small, local models."

## Goal

1. A solid suite of **22 basic-to-moderate scenarios** covering Producer Pal's
   core surface area.
2. Run them across a **matrix of models × config profiles** and produce a
   comparison we can analyze.
3. Identify where cheap/local models break, and whether **small-model mode**
   (simplified tool descriptions) closes the gap.
4. Feed findings back to the project — and explore whether an Ableton-tuned
   small/local setup is viable down the road.

## How the eval harness works (the parts that matter)

The machinery already exists in `evals/`. Key pieces:

- **Scenarios** (`evals/scenarios/defs/*.ts`) — a multi-turn conversation plus
  assertions. Registered in `defs/index.ts` and `load-scenarios.ts`.
- **Assertions** (4 types, each worth points):
  - `tool_called` — was the right tool called (optionally on a specific turn)?
  - `response_contains` — text/regex in the response.
  - `state` — verifies actual Live Set state via an MCP tool call.
  - `llm_judge` — a judge model rates accuracy / reasoning / efficiency /
    naturalness (0–1 each, averaged × score). Judge defaults to Gemini 3 Flash.
- **Config profiles** (`config-profiles.ts`) — orthogonal server settings:
  - `default` — JSON output, full tools, normal mode.
  - `small-model` — enables **small-model mode** (simplified tool descriptions);
    the main lever for cheap/local models.
  - `json-off` — disables JSON output.
- **The matrix** — the runner (`evals/scenarios/index.ts`) loops scenarios ×
  models × configs and prints per-run results plus a comparison table when more
  than one model/config is tested.

```
scripts/eval -a -m <modelA> -m <modelB> -c default -c small-model
#            ^all scenarios  ^each model repeated     ^each config
```

**Requirement:** the eval runner talks to Producer Pal over MCP, which means
**Ableton Live must be running with the Producer Pal device loaded** on the
machine running the evals. That's why execution happens on Taylor's computer,
not in the cloud dev environment.

## The 22-scenario suite

Six scenarios pre-existed; sixteen were added for broad coverage of Adam's
priority areas. All run against the `basic-midi-4-track` Live Set (tracks:
Drums, Bass, Chords + 2 more; A minor; 120 BPM; 4/4; 8 scenes).

| Area               | Scenarios                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| Connect / meta     | `connect-to-ableton`, `memory-workflow`                                                                      |
| Transport          | `playback-control`, `set-tempo-and-time-signature`                                                           |
| Reading / analysis | `read-and-analyze-set`, `analyze-clip-content`, `inspect-track-devices`                                      |
| Track management   | `create-multiple-tracks`, `rename-and-color-track`, `delete-track`, `duplicate`, `track-and-device-workflow` |
| Scene management   | `scene-management`, `fire-scene`                                                                             |
| Device handling    | `add-and-configure-device`, `load-instrument`                                                                |
| MIDI generation    | `create-and-edit-clip`, `midi-melody`, `midi-chord-progression`, `midi-bassline`                             |
| Arranging          | `arrangement-workflow`                                                                                       |
| Workflow (complex) | `jambalaya-sampler-plate`                                                                                    |

List them anytime with `scripts/eval -l`.

## The provider landscape (what to test, and why)

Only **five providers** are wired into the eval code path
(`evals/shared/provider-configs.ts`, `evals/chat/ai-sdk-provider.ts`):
`anthropic`, `google`, `openai`, `openrouter`, `local`.

Think in tiers:

1. **Frontier paid (baseline / "ceiling").** The reference for "what good looks
   like." These should ace the suite.
   - `claude-sonnet-4-5` (anthropic), `gemini-3-pro-preview` (google), `gpt-5`
     (openai).
2. **Cheap cloud (the sweet spot).** Cheap first-party small models.
   - `gemini-3-flash-preview` (google), `gpt-5-nano` (openai),
     `claude-haiku-4.5` (anthropic).
3. **Hosted open-source via OpenRouter.** This is the "pay a service to run
   open-source models for you" option — one integration
   (`@openrouter/ai-sdk-provider`) that proxies Llama, Qwen, DeepSeek, Mistral,
   GLM, Kimi, and more, many with cheap or free tiers. Prefer this over wiring
   each vendor (Groq/Together/Fireworks) separately — OpenRouter already covers
   them. Use `openrouter/<slug>`; **confirm exact slugs at
   <https://openrouter.ai/models>** since they change.
   - e.g. `openrouter/qwen/qwen3-...`, `openrouter/deepseek/deepseek-...`,
     `openrouter/moonshotai/kimi-...`, `openrouter/z-ai/glm-...`,
     `openrouter/meta-llama/llama-...`
4. **Local (free, private, the end-goal experiment).** Run via Ollama (default
   `http://localhost:11434/v1`) or LM Studio. Use the `local/` prefix and the
   `small-model` config.
   - e.g. `local/qwen3:8b`, `local/llama3.1:8b`, `local/glm-4-...`
   - Pull models first (Ollama): `ollama pull qwen3:8b`

> Note: Groq, Mistral, Fireworks, HuggingFace keys appear in `.env.example` but
> are **not** connected to the eval runner today. If we ever want Groq directly
> (notably fast for open models), that's a small, well-scoped addition — but
> OpenRouter covers those models already, so it isn't required.

## API key setup

`.env` is gitignored (good — never commit keys). `scripts/eval` runs
`tsx --env-file=.env`, which **fails if `.env` is missing**. So, first time:

```bash
cp .env.example .env
# then edit .env and fill in the keys for the providers you'll test
```

Which keys map to which provider:

| Provider in `-m`         | `.env` key                | Get a key              |
| ------------------------ | ------------------------- | ---------------------- |
| `anthropic` / `claude-*` | `ANTHROPIC_KEY`           | console.anthropic.com  |
| `google` / `gemini-*`    | `GEMINI_KEY`              | aistudio.google.com    |
| `openai` / `gpt-*`       | `OPENAI_KEY`              | platform.openai.com    |
| `openrouter/*`           | `OPENROUTER_KEY`          | openrouter.ai/keys     |
| `local/*`                | none (or `LOCAL_API_KEY`) | run Ollama / LM Studio |

Optional: `LOCAL_BASE_URL` (default `http://localhost:11434/v1`), `MCP_URL`
(default `http://localhost:3350/mcp`).

The judge model also needs a key — it defaults to Gemini 3 Flash (`GEMINI_KEY`).
Override with `-j <provider/model>`.

## Run commands

Once Ableton + Producer Pal are running and `.env` is filled:

```bash
# Sanity: list all scenarios (no Ableton needed)
scripts/eval -l

# Smoke test one scenario on one model
scripts/eval -t connect-to-ableton -m gemini-3-flash-preview

# A small comparison: one scenario, three tiers
scripts/eval -t midi-chord-progression \
  -m claude-sonnet-4-5 \
  -m gemini-3-flash-preview \
  -m local/qwen3:8b -c small-model

# The full matrix: all 22 scenarios × several models × both configs
scripts/eval -a \
  -m claude-sonnet-4-5 \
  -m gemini-3-flash-preview \
  -m gpt-5-nano \
  -m openrouter/qwen/qwen3-... \
  -m local/qwen3:8b \
  -c default -c small-model

# Or: run the standard lineup + auto-analyze in one go (edit the lineup inside)
scripts/eval-comparison
```

Tips:

- Start small and widen. The full matrix is a lot of API calls (and money/time);
  smoke-test first.
- `-s` / `--skip-setup` reuses the current Live Set instead of reopening it.
- `-q` / `--quiet` trims the per-run chatter.

## Results workflow

By default the runner saves every run to `eval-results/<timestamp>/` as:

- `results.json` — full structured data (scores, per-assertion, tool calls, and
  **token usage** per turn and per run).
- `report.md` — a human-readable comparison table + per-scenario breakdown.

(Use `--no-save` to skip.) Token usage is captured automatically from the AI SDK
(`totalUsage`, summed across tool-call steps); providers that don't report usage
simply leave it blank.

### Analyzing results

`scripts/eval-analyze` turns a saved run into insights (no Ableton or API keys
needed — it just reads `results.json`):

```bash
scripts/eval-analyze                       # newest run under eval-results/
scripts/eval-analyze eval-results/<stamp>  # a specific run
scripts/eval-analyze path/to/results.json  # a specific file
```

It prints (and writes `analysis.md` beside the results):

- **Leaderboard** — models/configs ranked by average score %, with token totals,
  estimated **cost**, **cost-per-point**, latency, and error counts.
- **Best value (cost per point)** — models ranked by USD per earned point
  (cheapest-per-point first) — the answer to "what's the best bang for the
  buck?"
- **Most discriminating scenarios** — ranked by score spread (which tests best
  separate strong from weak models).
- **Small-model mode impact** — for any model run under both `default` and
  `small-model`, the score delta (does the simplified-description mode help?).
- **Tool usage** — per-model tool-call tallies (spot models that skip tools).
- **Errors** — every errored run.

#### Cost / pricing

Cost is estimated from per-1M-token prices in
`evals/scenarios/helpers/model-pricing.ts`. **These are best-effort defaults and
drift** — local models are treated as free, and unknown models show blank cost.
To use exact current prices without editing code, drop an `eval-pricing.json` in
the repo root and the analyzer merges it over the defaults:

```json
{
  "claude-sonnet": { "inputPer1M": 3, "outputPer1M": 15 },
  "gpt-5-nano": { "inputPer1M": 0.05, "outputPer1M": 0.4 }
}
```

Keys are matched as case-insensitive substrings of the `provider/model` key
(longest match wins). `eval-pricing.json` is gitignored.

Bring the `eval-results/` files back here and we can dig in together — diff
models, spot which scenarios separate the tiers, weigh score against cost, and
decide what to tune.

## Status: done vs. needs Taylor's machine

**Done in the cloud session (no Ableton needed):**

- 22 scenarios authored, registered, type-checked, linted.
- Results persistence (`eval-results/` JSON + markdown report).
- Token usage capture (per turn + per run) and cost/cost-per-point analysis,
  with an editable pricing table + `eval-pricing.json` override.
- Results analyzer (`scripts/eval-analyze`) with unit tests.
- `scripts/eval-comparison` one-command matrix + analysis wrapper.
- This runbook + an improved `.env.example`.

**Needs Taylor's machine:**

- Filling `.env` with real API keys.
- Pulling local models in Ollama.
- Running the matrix (Ableton Live + Producer Pal must be live).
- Bringing `eval-results/` back for analysis.

## Open questions / next steps

- Lock the exact model lineup (confirm OpenRouter slugs; pick which locals — the
  Kimi K2 / GLM / Qwen / DeepSeek candidates Taylor mentioned).
- Decide the judge model (Gemini 3 Flash default vs. a paid judge for fairness).
- After a first run: which scenarios best separate the tiers? Trim/extend.
- Drop in an `eval-pricing.json` with current prices for accurate cost numbers.
- Stretch: investigate whether description tuning in small-model mode measurably
  helps; consider per-scenario cost breakdowns and judge-token accounting.
