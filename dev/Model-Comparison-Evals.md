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

### Claude-only runs (and a note on Pro/Max plans)

The `anthropic` provider calls the Anthropic **API** (via the AI SDK), which
needs an `ANTHROPIC_KEY` from console.anthropic.com and is billed per token. A
Claude Pro/Max subscription **cannot drive the AI SDK** — those are OAuth
subscriptions scoped to Claude.ai and Claude Code, and Anthropic disallows
subscription auth with the SDK. So `anthropic`-provider evals are pay-as-you-go
API usage (a Sonnet + Haiku full matrix is typically low single-digit dollars;
Opus output is much pricier).

If you'd rather spend your Max plan than API credits, use the **`claude-code`
provider** instead (next section) — it runs Claude through the `claude` CLI on
your subscription.

To run across Claude models only — judged by Claude, so `ANTHROPIC_KEY` is the
only key you need:

```bash
# Smoke test first (one scenario, cheap model + cheap judge)
scripts/eval -t connect-to-ableton -m claude-haiku-4-5 -j claude-haiku-4-5

# Full Claude matrix, judged by Claude
scripts/eval -a \
  -m claude-sonnet-4-5 \
  -m claude-haiku-4-5 \
  -c default -c small-model \
  -j claude-haiku-4-5
scripts/eval-analyze
```

`-j claude-haiku-4-5` overrides the default Gemini judge (no `GEMINI_KEY`
needed). Confirm exact model IDs at docs.anthropic.com — they version over time;
the harness just needs the `claude-` prefix to route to Anthropic.

### Running Claude on your Max plan instead of the API (`claude-code` provider)

The `anthropic` provider above bills the metered API. There is now a second way
to run Claude models that bills your **Claude Max subscription** instead, so a
Claude eval run costs nothing beyond your existing plan: the **`claude-code`
provider**.

How it works (see `evals/chat/claude-cli-session.ts` and
`claude-cli-protocol.ts`): instead of driving an AI SDK model, it hands each
scenario turn to the local `claude` CLI (`claude --print`) with
`ANTHROPIC_API_KEY` stripped from the subprocess, which forces Claude Code to
bill against your Max OAuth login rather than the API. Producer Pal is wired in
as an MCP server (`--mcp-config`), so Claude Code executes the `ppal-*` tools
itself; we parse its `stream-json` output back into the same
`{ text, toolCalls, usage }` the AI SDK path produces, so every assertion
(`tool_called`, `state`, `response_contains`, `llm_judge`) works unchanged.
(This mechanism is borrowed from the Signal Studio CLI transport; the difference
is we _enable_ MCP for agentic tool-calling rather than disabling it.)

Prerequisites:

- Claude Code (`claude`) installed and logged in to your Max plan (`claude` once
  interactively, or `/login`). No `ANTHROPIC_KEY` needed.
- Ableton Live + Producer Pal running (same as any eval run).

Usage — address models as `claude-code/<model>` (aliases `sonnet`, `haiku`,
`opus`, or a pinned `claude-…` id). The judge can run on Max too, so a
fully-free run needs **zero API keys**:

```bash
# Smoke test: one scenario on Max, judged on Max (no API keys)
scripts/eval -t connect-to-ableton \
  -m claude-code/haiku -j claude-code/haiku

# Full Claude matrix on your Max plan, judged on Max
scripts/eval -a \
  -m claude-code/sonnet \
  -m claude-code/haiku \
  -c default -c small-model \
  -j claude-code/haiku
scripts/eval-analyze
```

Caveats (be aware when comparing to the API path):

- **Not identical conditions.** Claude Code runs each turn inside its own agent
  harness. The transport **replaces** Claude Code's built-in coding-agent system
  prompt (via `--system-prompt`) with a neutral Producer Pal role prompt
  (`DEFAULT_SYSTEM_PROMPT` in `claude-cli-protocol.ts`), or a scenario's own
  `instructions` when set. This matters a lot for small models: without it, the
  coding-agent framing makes e.g. `claude-code/haiku` hedge ("could you
  clarify?") instead of calling the tools — connect-to-ableton swung from 10% to
  100% once the prompt was replaced. Even so, `claude-code/sonnet` measures
  "Claude driving Producer Pal _via Claude Code_," not a like-for-like swap for
  the raw-API `anthropic` provider. Note which provider produced a result set.
- **Cost column is the API-equivalent estimate.** `scripts/eval-analyze` prices
  `claude-code` runs from token counts as if they were API calls. Your real
  spend is whatever your Max plan's included Agent SDK usage covers (~$0 at eval
  scale); treat the dollar figure as "what this _would_ cost on the API."
- **Tools are scoped to Producer Pal.** The run allows only `mcp__producer-pal`
  tools; Claude Code's built-ins (Bash, file edits) are denied in `--print`
  mode, keeping runs safe and comparable.

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

## Findings & next steps (2026-06-21)

After running the suite across Claude models on the `claude-code` (Max)
transport — see also `dev/...` and the session notes — two things shape the next
moves:

### Close the local/cheap-model gap (Adam's #1 strategic priority)

Adam's stated focus is "use evals to make local models work much better" (he's
excited about Gemma 4 for free/offline use). We have a 50-scenario suite and a
clean harness now, so the concrete plan:

1. **Pull local models** (Ollama): start with `gemma-4` (or `qwen3:8b`,
   `llama3.1:8b`, `deepseek-r1:8b`). `ollama pull <model>`.
2. **Baseline run** — the suite on each local model, default config:
   ```bash
   scripts/eval -a -m local/gemma-4 -m local/qwen3:8b -c default \
     -j claude-code/haiku   # free judge on Max; or a paid judge for fairness
   ```
   (Local models route through the AI SDK OpenAI-compatible path to Ollama at
   `LOCAL_BASE_URL`; they do NOT use the claude-code transport.)
3. **Identify break points** — the discriminating scenarios (musical reasoning,
   racks/macros, multi-step builds) are where small models should fall apart.
   `scripts/eval-analyze` ranks them by spread.
4. **Tune `smallModelModeConfig`** (the `excludeParams` / `descriptionOverrides`
   / `toolDescription` in each `.def.ts`) and re-run with `-c small-model` to
   see if simplified descriptions close the gap. NOTE: on Claude models,
   small-model mode _hurt_ (−7%); the open question is whether it _helps_
   genuinely small local models (its intended audience). This is the core
   experiment.
5. Repeat per Adam's TDD loop: adjust skills/descriptions → re-run → measure.

### Efficiency (Adam's #2 — "longer chats, get more done, pay/use less")

Token analysis of a clean run shows **input/context is ~98% of tokens** (output
~2%), heavily cached. So the efficiency lever is **shrinking re-sent context**,
not output:

- **Tool/param descriptions** (`.def.ts`) and the injected **Producer Pal
  skills** (`connect.ts`) are re-sent every turn — the CLAUDE.md "context
  optimization" rule already targets these.
- **Tool result verbosity** matters most: a verbose `ppal-read-*` result becomes
  input tokens on every subsequent turn. Trimming read-tool output is
  high-value.
- Heaviest scenarios are multi-turn reading/workflows (`jambalaya-sampler-plate`
  ~1.08M tokens, `analyze-clip-content`, `arrangement-workflow`).
- The harness already captures per-run tokens + cost, so any trim can be
  measured as cost-per-point before/after — eval-driven efficiency, exactly
  Adam's goal.

> Caveat: the numbers above are from the `claude-code` transport, which adds its
> own agent context; a raw-API run would isolate Producer Pal's own footprint
> more cleanly.
