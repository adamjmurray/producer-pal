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

| Flag                         | Description                                     |
| ---------------------------- | ----------------------------------------------- |
| `-m, --model <model>`        | Model to test (required)                        |
| `-t, --test <id>`            | Run specific scenario by ID (repeatable)        |
| `-a, --all`                  | Run all scenarios                               |
| `-c, --config <profile>`     | Config profile (repeatable, default: `default`) |
| `-j, --judge <model>`        | Judge model (default: `gemini-3-flash-preview`) |
| `-s, --skip-setup`           | Skip Live Set setup (reuse existing connection) |
| `-q, --quiet`                | Suppress detailed AI and judge responses        |
| `-r, --repeat <N>`           | Run each scenario N times (for flakiness)       |
| `-u, --usage`                | Show token usage per turn                       |
| `-I, --default-instructions` | Use default system instructions                 |
| `-l, --list`                 | List available scenarios and config profiles    |

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
| `openrouter/some-model`         | openrouter |
| `local/model-name`              | local      |

### Examples

```bash
# Run all scenarios with a specific model
scripts/eval -a -m gemini-3-flash-preview

# Compare two models on one scenario
scripts/eval -t connect-to-ableton -m gemini-3-flash-preview -m claude-sonnet-4-5

# Skip Live Set reopening (reuse current MCP connection)
scripts/eval -t connect-to-ableton -s
```

### Testing local models

Local models (Ollama, LM Studio, etc.) need special handling:

1. **Always specify the model explicitly** with the `local/` prefix
2. **Use the `small-model` config profile** (`-c small-model`) to enable
   simplified tool descriptions

```bash
# Test a local model
scripts/eval -m local/glm-4.7-flash -t connect-to-ableton -c small-model

# Test a different local model
scripts/eval -m local/qwen3-8b -t duplicate -c small-model
```

The local provider connects to `http://localhost:11434/v1` by default (Ollama).
Override with `-b` / `--base-url` in the chat CLI, or set `LOCAL_BASE_URL` in
`.env` for evals.

### Config profiles

Profiles control server-side settings that are orthogonal to scenarios:

| Profile       | Description                                          |
| ------------- | ---------------------------------------------------- |
| `default`     | Standard: JSON output, full tools, normal model mode |
| `small-model` | Enables small model mode (simplified descriptions)   |
| `json-off`    | Disables JSON output formatting                      |

Test multiple configs in a matrix:

```bash
scripts/eval -t connect-to-ableton -c default -c small-model
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

### Eval matrix

The eval CLI supports running a full matrix of scenarios x models x configs.
Results are displayed in a comparison table when multiple models or configs are
tested.

```bash
# 2 scenarios x 2 models x 2 configs = 8 runs
scripts/eval -a -m gemini-3-flash-preview -m claude-sonnet-4-5 -c default -c small-model
```

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
