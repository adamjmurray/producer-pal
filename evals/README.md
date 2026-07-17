<!--
Producer Pal
Copyright (C) 2026 Adam Murray, Taylor Haun
AI assistance: Claude (Anthropic), Codex (OpenAI)
SPDX-License-Identifier: GPL-3.0-or-later
-->

# Evals

Two CLI tools for testing LLM behavior with Producer Pal's MCP tools:

- **`scripts/eval`** - Automated evaluation scenarios with scoring and
  assertions
- **`scripts/chat`** - Interactive chat sessions for manual testing

Both require Ableton Live running with the Producer Pal device loaded.

## Eval CLI

Runs predefined scenarios against Ableton Live and scores the results.

```bash
scripts/eval [options]
```

### Options

| Flag                  | Description                                       |
| --------------------- | ------------------------------------------------- |
| `-m, --model <model>` | Model to test (required, repeatable)              |
| `-t, --test <id>`     | Run specific scenario by ID (repeatable)          |
| `-a, --all`           | Run all scenarios                                 |
| `--small-model`       | Enable small-model mode (basic skills + schemas)  |
| `--json`              | JSON tool-result output (default: compact)        |
| `--tools <list>`      | Tool subset, comma-separated (default: all)       |
| `--live-api`          | Enable the Direct Live API tool (`ppal-live-api`) |
| `-j, --judge <model>` | Judge model (default: `gemini-3-flash-preview`)   |
| `-s, --skip-setup`    | Skip Live Set setup (reuse existing connection)   |
| `--skip-judge`        | Skip the LLM-as-judge step (checks only)          |
| `--skip-reflection`   | Skip the self-reflection turn after a failure     |
| `-q, --quiet`         | Suppress detailed AI and judge responses          |
| `-r, --repeat <N>`    | Run each scenario N times (for flakiness)         |
| `-u, --usage`         | Show token usage per turn                         |
| `--no-save`           | Skip writing JSON result files to disk            |
| `-l, --list`          | List available scenarios                          |

### Model format

Models use `provider/model` format, or just the model name if the provider can
be inferred from the prefix:

| Format                          | Provider   |
| ------------------------------- | ---------- |
| `gemini-3-flash-preview`        | google     |
| `claude-sonnet-4-5`             | anthropic  |
| `gpt-5-nano`                    | openai     |
| `google/gemini-3-flash-preview` | google     |
| `anthropic/claude-sonnet-4-5`   | anthropic  |
| `codex-code/sol`                | codex-code |
| `codex-code/terra`              | codex-code |
| `codex-code/luna`               | codex-code |
| `openrouter/some-model`         | openrouter |
| `local/model-name`              | local      |

### Examples

```bash
# Run all scenarios with a specific model
scripts/eval -a -m gemini-3-flash-preview

# Compare two models on one scenario
scripts/eval -t connect-to-ableton -m gemini-3-flash-preview -m claude-sonnet-4-5

# Compare Codex subscription models (requires `codex login`)
scripts/eval -t connect-to-ableton \
  -m codex-code/sol -m codex-code/terra -m codex-code/luna

# Skip Live Set reopening (reuse current MCP connection)
scripts/eval -t connect-to-ableton -s
```

### Testing local models

Local models (Ollama, LM Studio, etc.) need special handling:

1. **Always specify the model explicitly** with the `local/` prefix
2. **Enable small-model mode** (`--small-model`) for the basic skills tier and
   simplified tool descriptions

```bash
# Test a local model
scripts/eval -m local/glm-4.7-flash -t connect-to-ableton --small-model

# Test a different local model
scripts/eval -m local/qwen3-8b -t duplicate --small-model
```

The local provider connects to `http://localhost:11434/v1` by default (Ollama).
Override with `-b` / `--base-url` in the chat CLI, or set `LOCAL_BASE_URL` in
`.env` for evals.

### Run environment

A run mirrors the device's settings panel: you choose the environment with CLI
flags, then the scenarios run as conversations against it. The environment is
server-side state applied before each scenario:

| Flag             | Effect                                                            |
| ---------------- | ----------------------------------------------------------------- |
| _(none)_         | Default: compact output, all standard tools, normal model         |
| `--small-model`  | Basic skills tier + reduced param schemas (small-model mode)      |
| `--json`         | JSON tool-result output (default is compact, the product default) |
| `--tools <list>` | Restrict to a tool subset (short or full names)                   |
| `--live-api`     | Add the opt-in Direct Live API tool on top of the toolset         |

Tests declare what they need via `requires` (e.g. the transforms DSL, bracket
notation, a specific tool, a small-model-excluded param). When the active
environment can't satisfy a requirement — e.g. a transforms scenario under
`--small-model`, or a scenario needing a tool you left out of `--tools` — the
scenario is **skipped** (reported as `skipped`, not `fail`) so scores stay
apples-to-apples.

```bash
# Default environment
scripts/eval -t connect-to-ableton -m gemini-3-flash-preview

# Small-model mode (transforms/bracket scenarios will skip)
scripts/eval -a -m local/qwen3-8b --small-model

# A restricted toolset (scenarios needing other tools will skip)
scripts/eval -a -m gemini-3-flash-preview --tools connect,read-track,create-clip
```

### Scenarios

List available scenarios:

```bash
scripts/eval -l
```

Run `scripts/eval -l` for the current list. Scenarios are tagged as
**regression** (should always pass) or **capability** (improvement targets, may
have low pass rates).

### Scoring

Each scenario has assertions that contribute to pass/fail:

- **`tool_called`** - Verifies the right tool was called (with optional arg
  matching)
- **`response_contains`** - Checks for text/regex patterns in responses
- **`state`** - Verifies Live Set state via MCP tool calls
- **`custom`** - Arbitrary callback assertions on turn data

Plus informational-only assertions (don't affect pass/fail):

- **`llm_judge`** - LLM evaluates response quality with pass/fail + issues
- **`token_usage`** - Tracks token efficiency against a target budget

The judge defaults to Gemini 3 Flash. Override with `-j`.

When using `-r N`, the summary aggregates across trials: checks are totaled,
efficiency is averaged, and judge shows a pass rate.

### Comparing models

Pass `-m` multiple times to run the same scenarios across models in one run
environment. Results are displayed in a comparison table when more than one
model is tested.

```bash
# 2 scenarios x 2 models = 4 runs, one table
scripts/eval -a -m gemini-3-flash-preview -m claude-sonnet-4-5
```

To compare environments (e.g. default vs `--small-model`), do a run per
environment and diff them with `scripts/eval-report --compare <runId> <runId>`.

## Chat CLI

Interactive chat for manual testing and debugging.

```bash
scripts/chat [options] [text...]
```

### Options

| Flag                             | Description                                  |
| -------------------------------- | -------------------------------------------- |
| `-m, --model <model>` (required) | Model in `provider/model` format             |
| `-1, --once`                     | Exit after one response                      |
| `-t, --thinking <level>`         | Thinking/reasoning level (provider-specific) |
| `-r, --randomness <number>`      | Temperature (0.0-1.0)                        |
| `-o, --output-tokens <number>`   | Max output tokens                            |
| `-i, --instructions <text>`      | System instructions                          |
| `-s, --sequence <messages...>`   | Multiple messages to send in sequence        |
| `-f, --file <path>`              | File containing messages (one per line)      |
| `-b, --base-url <url>`           | Base URL for local provider                  |
| `-n, --no-stream`                | Disable streaming                            |
| `-d, --debug`                    | Log all API responses                        |

### Examples

```bash
# Quick one-shot test with Gemini
scripts/chat -m gemini-3-flash-preview -1 "list tracks in the set"

# Interactive session with Claude
scripts/chat -m claude-sonnet-4-5

# Test a local model
scripts/chat -m local/glm-4.7-flash -1 "connect to Ableton"

# Local model with custom server URL
scripts/chat -m local/some-model -b http://localhost:1234/v1 -1 "list tracks"
```

## Environment variables

Set these in `.env` at the project root:

| Variable         | Description                                             |
| ---------------- | ------------------------------------------------------- |
| `GEMINI_KEY`     | Google Gemini API key                                   |
| `ANTHROPIC_KEY`  | Anthropic API key                                       |
| `OPENAI_KEY`     | OpenAI API key                                          |
| `OPENROUTER_KEY` | OpenRouter API key                                      |
| `LOCAL_API_KEY`  | Local server API key (optional)                         |
| `LOCAL_BASE_URL` | Local server URL (default: `http://localhost:11434/v1`) |
| `MCP_URL`        | MCP server URL (default: `http://localhost:3350/mcp`)   |

## Prerequisites

- Ableton Live running with the Producer Pal Max for Live device
- The MCP server must be responsive (eval auto-opens Live Sets and waits for the
  server)
- API keys configured for the providers you want to test
- For local models: Ollama, LM Studio, or another OpenAI-compatible server
  running

## Adding scenarios

Scenarios are defined in `evals/scenarios/defs/`. Each file exports an
`EvalScenario` object:

```typescript
export const myScenario: EvalScenario = {
  id: "my-scenario",
  description: "What this tests",
  kind: "regression",
  liveSet: "basic-midi-4-track", // from evals/live-sets/
  messages: ["Connect to Ableton Live", "Do something specific"],
  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0 },
    { type: "response_contains", pattern: /expected/i },
    {
      type: "state",
      tool: "ppal-read-track",
      args: { trackIndex: 0 },
      expect: { name: "Drums" },
    },
    { type: "llm_judge", prompt: "Evaluate if..." },
  ],
};
```

Register new scenarios in `evals/scenarios/defs/index.ts` and
`evals/scenarios/load-scenarios.ts`.

### Design guidelines

- **Target ~20 scenarios total.** Each eval run requires Ableton Live and takes
  real time, so keep the suite focused. Don't add scenarios for the sake of
  coverage — add them when you find a bug, add a tool, or want to validate a
  specific model's behavior.
- **Prefer deterministic assertions.** `tool_called`, `state`, and
  `response_contains` are fast, cheap, and reproducible. Use `llm_judge` only
  when you need to evaluate something subjective (tone, reasoning quality).
- **Grade outcomes, not paths.** Assert on the final state (e.g., "clip has
  these notes") rather than the exact sequence of tool calls. This avoids
  penalizing models that find valid alternative approaches.
- **Keep messages unambiguous.** Vague prompts create flaky evals. If a scenario
  fails at 0%, suspect the prompt before the model.
- **Regression vs capability:** Tag scenarios as `kind: "regression"` when they
  should always pass (use these to catch regressions). Tag as
  `kind: "capability"` for aspirational tests that target difficult tasks —
  these start with low pass rates and graduate to regression once stable.
- **Use `-r N` to diagnose flakiness.** If a regression eval fails
  intermittently, run it 3 times to confirm whether it's flaky or broken before
  investigating.
